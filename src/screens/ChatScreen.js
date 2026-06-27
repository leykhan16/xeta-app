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
  Pressable,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { getMessages, sendMessage, getUserPublicKey, uploadImage } from '../services/api';
import { encryptMessage, decryptMessage } from '../crypto/e2e';

export default function ChatScreen({ route, navigation }) {
  const { conversationId, otherUserId, otherUsername } = route.params;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [theirPublicKey, setTheirPublicKey] = useState(null);
  const [otherAvatarUrl, setOtherAvatarUrl] = useState(null);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [sound, setSound] = useState(null);
  const flatListRef = useRef(null);

  useEffect(() => {
    loadChat();
    const interval = setInterval(() => {
      if (theirPublicKey) loadMessages(theirPublicKey);
    }, 3000);
    return () => {
      clearInterval(interval);
      if (sound) sound.unloadAsync();
    };
  }, [theirPublicKey]);

  const getMyPrivateKey = async () => {
    const username = await SecureStore.getItemAsync('xeta_username');
    return SecureStore.getItemAsync(`xeta_private_key_${username}`);
  };

  const loadChat = async () => {
    try {
      if (!otherUsername) { setLoading(false); return; }
      const keyData = await getUserPublicKey(otherUsername);
      setTheirPublicKey(keyData.public_key);

      try {
        const { getUserProfile } = await import('../services/api');
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
          plaintext = decryptMessage(msg.ciphertext, msg.nonce, theirPubKey, myPrivKey) || '[could not decrypt]';
        }
        return { ...msg, plaintext, isMe };
      });

      setMessages(decrypted);
    } catch {}
  };

  const handleSend = async () => {
    if (!text.trim()) return;
    if (!theirPublicKey) { Alert.alert('Error', 'Cannot encrypt message'); return; }

    setSending(true);
    const messageText = text.trim();
    setText('');

    try {
      const privKey = await getMyPrivateKey();
      const { ciphertext, nonce } = await encryptMessage(messageText, theirPublicKey, privKey);
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
    if (!theirPublicKey) { Alert.alert('Error', 'Cannot encrypt'); return; }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Permission needed', 'Please allow photo access.'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled) return;

    setSending(true);
    try {
      const asset = result.assets[0];
      const url = await uploadImage(asset.uri, asset.mimeType || 'image/jpeg');
      const privKey = await getMyPrivateKey();
      const { ciphertext, nonce } = await encryptMessage('📷 Photo', theirPublicKey, privKey);
      await sendMessage(otherUserId, ciphertext, nonce, url);
      await loadMessages(theirPublicKey);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      Alert.alert('Error', 'Failed to send image: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  // ── Voice recording ──────────────────────────────

  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert('Permission needed', 'Please allow microphone access.'); return; }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to start recording: ' + error.message);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    setSending(true);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) return;

      // Upload the audio file
      const url = await uploadImage(uri, 'audio/m4a');

      // Encrypt a caption
      const privKey = await getMyPrivateKey();
      const { ciphertext, nonce } = await encryptMessage('🎤 Voice note', theirPublicKey, privKey);
      await sendMessage(otherUserId, ciphertext, nonce, url);
      await loadMessages(theirPublicKey);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      Alert.alert('Error', 'Failed to send voice note: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  // ── Audio playback ───────────────────────────────

  const playAudio = async (url, msgId) => {
    try {
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
        if (playingId === msgId) { setPlayingId(null); return; }
      }

      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: url });
      setSound(newSound);
      setPlayingId(msgId);
      await newSound.playAsync();
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) { setPlayingId(null); }
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to play audio: ' + error.message);
    }
  };

  // ── Render ───────────────────────────────────────

  const isVoiceNote = (msg) => msg.media_url && (
    msg.media_url.includes('.m4a') ||
    msg.media_url.includes('.mp4') ||
    msg.media_url.includes('.aac') ||
    msg.plaintext === '🎤 Voice note'
  );

  const isImage = (msg) => msg.media_url && !isVoiceNote(msg);

  const renderMessage = ({ item }) => (
    <View style={[styles.messageBubble, item.isMe ? styles.myBubble : styles.theirBubble]}>
      {isImage(item) ? (
        <Image source={{ uri: item.media_url }} style={styles.messageImage} />
      ) : null}

      {isVoiceNote(item) ? (
        <TouchableOpacity
          style={styles.voiceNoteButton}
          onPress={() => playAudio(item.media_url, item.id)}
        >
          <Text style={styles.voiceNoteIcon}>
            {playingId === item.id ? '⏸' : '▶️'}
          </Text>
          <Text style={styles.voiceNoteText}>Voice note</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.messageText}>{item.plaintext}</Text>
      )}

      <Text style={styles.messageTime}>
        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
          <Text style={styles.headerName}>@{otherUsername || otherUserId.slice(0, 8)}</Text>
          <Text style={styles.headerSub}>End-to-end encrypted 🔐</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={styles.emptyText}>No messages yet</Text>}
      />

      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.attachButton} onPress={handlePickImage} disabled={sending}>
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

        {text.trim().length > 0 ? (
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
        ) : (
          <Pressable
            style={[styles.sendButton, isRecording && styles.recordingButton]}
            onPressIn={startRecording}
            onPressOut={stopRecording}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendText}>{isRecording ? '⏹' : '🎤'}</Text>
            )}
          </Pressable>
        )}
      </View>

      {isRecording && (
        <View style={styles.recordingIndicator}>
          <Text style={styles.recordingText}>🔴 Recording... release to send</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 12 },
  back: { color: '#6c63ff', fontSize: 24, paddingRight: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6c63ff', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  headerAvatarImage: { width: 40, height: 40, borderRadius: 20 },
  headerName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  headerSub: { color: '#6c63ff', fontSize: 11, marginTop: 1 },
  messageList: { padding: 16, paddingBottom: 8 },
  messageBubble: { maxWidth: '75%', padding: 12, borderRadius: 16, marginBottom: 8, flexShrink: 1 },
  myBubble: { backgroundColor: '#6c63ff', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: '#1a1a1a', alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#2a2a2a' },
  messageImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 6 },
  messageText: { color: '#ffffff', fontSize: 15, flexShrink: 1, flexWrap: 'wrap' },
  messageTime: { color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  voiceNoteButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  voiceNoteIcon: { fontSize: 20 },
  voiceNoteText: { color: '#ffffff', fontSize: 14 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 60, fontSize: 14 },
  inputRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#1a1a1a', alignItems: 'flex-end', gap: 8 },
  attachButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  attachIcon: { fontSize: 22 },
  input: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#ffffff', fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: '#2a2a2a' },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#6c63ff', justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { opacity: 0.5 },
  recordingButton: { backgroundColor: '#ff4444' },
  sendText: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  recordingIndicator: { backgroundColor: '#1a1a1a', padding: 8, alignItems: 'center' },
  recordingText: { color: '#ff4444', fontSize: 13 },
});
