import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { getMessages, sendMessage, getUserPublicKey, uploadImage, getUserProfile } from '../services/api';
import { encryptMessage, decryptMessage } from '../crypto/e2e';

export default function ChatScreen({ route, navigation }) {
  const { conversationId, otherUserId, otherUsername } = route.params;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [theirPublicKey, setTheirPublicKey] = useState(null);
  const [otherAvatarUrl, setOtherAvatarUrl] = useState(null);
  const flatListRef = useRef(null);

  useEffect(() => {
    loadChat();
    const interval = setInterval(() => {
      if (theirPublicKey) loadMessages(theirPublicKey);
    }, 3000);
    return () => clearInterval(interval);
  }, [theirPublicKey]);

  const getMyPrivateKey = async () => {
    const username = await SecureStore.getItemAsync('xeta_username');
    return SecureStore.getItemAsync(`xeta_private_key_${username}`);
  };

  const loadChat = async () => {
    try {
      if (!otherUsername) {
        setLoading(false);
        return;
      }
      const keyData = await getUserPublicKey(otherUsername);
      setTheirPublicKey(keyData.public_key);

      try {
        const profile = await getUserProfile(otherUsername);
        setOtherAvatarUrl(profile.avatar_url || null);
      } catch {}

      await loadMessages(keyData.public_key);
    } catch (error) {
      Alert.alert('Error', 'Failed to load chat: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (theirPubKey) => {
    try {
      const raw = await getMessages(conversationId);
      const myId = await SecureStore.getItemAsync('xeta_user_id');
      const myPrivKey = await getMyPrivateKey();

      const decrypted = raw.map((msg) => {
        const isMe = msg.sender_id === myId;
        let plaintext = '[encrypted]';

        if (theirPubKey && myPrivKey) {
          plaintext = decryptMessage(
            msg.ciphertext,
            msg.nonce,
            theirPubKey,
            myPrivKey
          ) || '[could not decrypt]';
        }

        return { ...msg, plaintext, isMe };
      });

      setMessages(decrypted);
    } catch (error) {
      // Silently fail on polling
    }
  };

  const handleSend = async () => {
    if (!text.trim()) return;
    if (!theirPublicKey) {
      Alert.alert('Error', 'Cannot encrypt — recipient has no public key');
      return;
    }

    setSending(true);
    const messageText = text.trim();
    setText('');

    try {
      const privKey = await getMyPrivateKey();
      const { ciphertext, nonce } = await encryptMessage(
        messageText,
        theirPublicKey,
        privKey
      );

      await sendMessage(otherUserId, ciphertext, nonce, null);
      await loadMessages(theirPublicKey);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      Alert.alert('Error', 'Failed to send: ' + error.message);
      setText(messageText);
    } finally {
      setSending(false);
    }
  };

  const handlePickImage = async () => {
    if (!theirPublicKey) {
      Alert.alert('Error', 'Cannot send — recipient has no public key');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (result.canceled) return;

    setSending(true);
    try {
      const asset = result.assets[0];
      const url = await uploadImage(asset.uri, asset.mimeType || 'image/jpeg');

      // Encrypt a small caption alongside the image so it's still E2E
      const privKey = await getMyPrivateKey();
      const { ciphertext, nonce } = await encryptMessage(
        '📷 Photo',
        theirPublicKey,
        privKey
      );

      await sendMessage(otherUserId, ciphertext, nonce, url);
      await loadMessages(theirPublicKey);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      Alert.alert('Error', 'Failed to send image: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }) => (
    <View style={[styles.messageBubble, item.isMe ? styles.myBubble : styles.theirBubble]}>
      {item.media_url ? (
        <Image source={{ uri: item.media_url }} style={styles.messageImage} />
      ) : null}
      <Text style={styles.messageText}>{item.plaintext}</Text>
      <Text style={styles.messageTime}>
        {new Date(item.created_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        {otherAvatarUrl ? (
          <Image source={{ uri: otherAvatarUrl }} style={styles.headerAvatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(otherUsername || otherUserId).slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}
        <View>
          <Text style={styles.headerName}>
            @{otherUsername || otherUserId.slice(0, 8)}
          </Text>
          <Text style={styles.headerSub}>End-to-end encrypted 🔐</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
        ListEmptyComponent={<Text style={styles.emptyText}>No messages yet</Text>}
      />

      <View style={styles.inputRow}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={handlePickImage}
          disabled={sending}
        >
          <Text style={styles.attachIcon}>📷</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor="#888"
          value={text}
          onChangeText={setText}
          multiline
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.sendButton, sending && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendText}>↑</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 12 },
  back: { color: '#6c63ff', fontSize: 24, paddingRight: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6c63ff', justifyContent: 'center', alignItems: 'center' },
  headerAvatarImage: { width: 40, height: 40, borderRadius: 20 },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  headerName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  headerSub: { color: '#6c63ff', fontSize: 11, marginTop: 1 },
  messageList: { padding: 16, paddingBottom: 8 },
  messageBubble: { maxWidth: '75%', padding: 12, borderRadius: 16, marginBottom: 8, flexShrink: 1 },
  myBubble: { backgroundColor: '#6c63ff', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: '#1a1a1a', alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#2a2a2a' },
  messageImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 6 },
  messageText: { color: '#ffffff', fontSize: 15, flexShrink: 1, flexWrap: 'wrap' },
  messageTime: { color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 60, fontSize: 14 },
  inputRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#1a1a1a', alignItems: 'flex-end', gap: 8 },
  attachButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  attachIcon: { fontSize: 22 },
  input: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#ffffff', fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: '#2a2a2a' },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#6c63ff', justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { opacity: 0.5 },
  sendText: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
});
