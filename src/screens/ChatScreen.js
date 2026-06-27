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
  Animated,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
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
  const [otherDisplayName, setOtherDisplayName] = useState(null);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingId, setPlayingId] = useState(null);
  const [sound, setSound] = useState(null);
  const flatListRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const durationTimer = useRef(null);

  useEffect(() => {
    loadChat();
    const interval = setInterval(() => {
      if (theirPublicKey) loadMessages(theirPublicKey);
    }, 3000);
    return () => {
      clearInterval(interval);
      if (sound) sound.unloadAsync();
      if (durationTimer.current) clearInterval(durationTimer.current);
    };
  }, [theirPublicKey]);

  useEffect(() => {
    if (isRecording) {
      // Pulse animation while recording
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();

      // Duration counter
      setRecordingDuration(0);
      durationTimer.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      if (durationTimer.current) {
        clearInterval(durationTimer.current);
        durationTimer.current = null;
      }
      setRecordingDuration(0);
    }
  }, [isRecording]);

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
        const profile = await getUserProfile(otherUsername);
        setOtherAvatarUrl(profile.avatar_url || null);
        setOtherDisplayName(profile.display_name || null);
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

  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert('Permission needed', 'Please allow microphone access.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
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
      const url = await uploadImage(uri, 'audio/m4a');
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

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isVoiceNote = (msg) => msg.media_url && (
    msg.media_url.includes('.m4a') ||
    msg.media_url.includes('.mp4') ||
    msg.media_url.includes('.aac') ||
    msg.plaintext === '🎤 Voice note'
  );

  const isImage = (msg) => msg.media_url && !isVoiceNote(msg);

  const formatTime = (dateStr) =>
    new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const renderMessage = ({ item }) => (
    <View style={[styles.messageRow, item.isMe ? styles.messageRowMe : styles.messageRowThem]}>
      {!item.isMe && (
        <View style={styles.smallAvatar}>
          {otherAvatarUrl ? (
            <Image source={{ uri: otherAvatarUrl }} style={styles.smallAvatarImage} />
          ) : (
            <Text style={styles.smallAvatarText}>
              {(otherUsername || '?').slice(0, 1).toUpperCase()}
            </Text>
          )}
        </View>
      )}
      <View style={[styles.messageBubble, item.isMe ? styles.myBubble : styles.theirBubble]}>
        {isImage(item) && (
          <Image source={{ uri: item.media_url }} style={styles.messageImage} />
        )}
        {isVoiceNote(item) ? (
          <TouchableOpacity
            style={styles.voiceNoteRow}
            onPress={() => playAudio(item.media_url, item.id)}
          >
            <View style={[styles.playButton, item.isMe ? styles.playButtonMe : styles.playButtonThem]}>
              <Text style={styles.playIcon}>{playingId === item.id ? '⏸' : '▶'}</Text>
            </View>
            <View style={styles.waveformContainer}>
              {Array.from({ length: 20 }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.waveBar,
                    { height: 4 + Math.random() * 16 },
                    item.isMe ? styles.waveBarMe : styles.waveBarThem,
                    playingId === item.id && i < 10 ? styles.waveBarActive : null,
                  ]}
                />
              ))}
            </View>
            <Text style={styles.voiceDuration}>0:00</Text>
          </TouchableOpacity>
        ) : !isImage(item) ? (
          <Text style={[styles.messageText, item.isMe ? styles.messageTextMe : styles.messageTextThem]}>
            {item.plaintext}
          </Text>
        ) : null}
        <View style={styles.messageFooter}>
          <Text style={[styles.messageTime, item.isMe ? styles.messageTimeMe : styles.messageTimeThem]}>
            {formatTime(item.created_at)}
          </Text>
          {item.isMe && <Text style={styles.checkmarks}>✓✓</Text>}
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#25D366" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        {otherAvatarUrl ? (
          <Image source={{ uri: otherAvatarUrl }} style={styles.headerAvatar} />
        ) : (
          <View style={styles.headerAvatarPlaceholder}>
            <Text style={styles.headerAvatarText}>
              {(otherUsername || '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>
            {otherDisplayName || `@${otherUsername}`}
          </Text>
          <Text style={styles.headerSub}>🔐 End-to-end encrypted</Text>
        </View>
      </View>

      {/* Messages */}
      <View style={styles.messagesContainer}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔐</Text>
              <Text style={styles.emptyText}>Messages are end-to-end encrypted</Text>
              <Text style={styles.emptySubtext}>No one outside this chat can read them</Text>
            </View>
          }
        />
      </View>

      {/* Recording indicator */}
      {isRecording && (
        <View style={styles.recordingBar}>
          <Animated.View style={[styles.recordingDot, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.recordingText}>Recording {formatDuration(recordingDuration)}</Text>
          <Text style={styles.recordingHint}>Release to send</Text>
        </View>
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.attachBtn} onPress={handlePickImage} disabled={sending}>
          <Text style={styles.attachIcon}>📎</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Message"
          placeholderTextColor="#888"
          value={text}
          onChangeText={setText}
          multiline
          autoCorrect={false}
        />

        {text.trim().length > 0 ? (
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={handleSend}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendIcon}>➤</Text>
            )}
          </TouchableOpacity>
        ) : (
          <Pressable
            style={[styles.sendBtn, isRecording && styles.recordingBtn]}
            onPressIn={startRecording}
            onPressOut={stopRecording}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendIcon}>{isRecording ? '⏹' : '🎤'}</Text>
            )}
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0f' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b0b0f' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 0.5,
    borderBottomColor: '#2a2a4a',
    gap: 10,
  },
  backButton: { padding: 4 },
  back: { color: '#6c63ff', fontSize: 22 },
  headerAvatar: { width: 42, height: 42, borderRadius: 21 },
  headerAvatarPlaceholder: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#6c63ff',
    justifyContent: 'center', alignItems: 'center',
  },
  headerAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  headerInfo: { flex: 1 },
  headerName: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  headerSub: { color: '#888', fontSize: 11, marginTop: 1 },

  // Messages
  messagesContainer: { flex: 1 },
  messageList: { padding: 12, paddingBottom: 4 },

  messageRow: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-end',
  },
  messageRowMe: { justifyContent: 'flex-end' },
  messageRowThem: { justifyContent: 'flex-start' },

  smallAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#6c63ff',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 6, marginBottom: 2,
  },
  smallAvatarImage: { width: 28, height: 28, borderRadius: 14 },
  smallAvatarText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    borderRadius: 18,
    flexShrink: 1,
  },
  myBubble: {
    backgroundColor: '#6c63ff',
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: '#1e1e2e',
    borderBottomLeftRadius: 4,
    borderWidth: 0.5,
    borderColor: '#2a2a4a',
  },

  messageImage: { width: 220, height: 220, borderRadius: 12, marginBottom: 4 },

  messageText: { fontSize: 15, lineHeight: 21, flexShrink: 1, flexWrap: 'wrap' },
  messageTextMe: { color: '#ffffff' },
  messageTextThem: { color: '#e0e0e0' },

  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2, gap: 4 },
  messageTime: { fontSize: 10 },
  messageTimeMe: { color: 'rgba(255,255,255,0.6)' },
  messageTimeThem: { color: '#666' },
  checkmarks: { color: '#a78bfa', fontSize: 11 },

  // Voice note
  voiceNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    minWidth: 180,
  },
  playButton: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  playButtonMe: { backgroundColor: 'rgba(255,255,255,0.2)' },
  playButtonThem: { backgroundColor: '#6c63ff' },
  playIcon: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  waveformContainer: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  waveBarMe: { backgroundColor: 'rgba(255,255,255,0.4)' },
  waveBarThem: { backgroundColor: '#6c63ff44' },
  waveBarActive: { backgroundColor: '#ffffff' },
  voiceDuration: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },

  // Empty state
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#888', fontSize: 14, fontWeight: '500', textAlign: 'center' },
  emptySubtext: { color: '#555', fontSize: 12, marginTop: 4, textAlign: 'center' },

  // Recording bar
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    padding: 12,
    gap: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#2a2a4a',
  },
  recordingDot: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: '#ff4444',
  },
  recordingText: { color: '#ff4444', fontSize: 14, fontWeight: '600', flex: 1 },
  recordingHint: { color: '#888', fontSize: 12 },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    paddingHorizontal: 10,
    backgroundColor: '#1a1a2e',
    borderTopWidth: 0.5,
    borderTopColor: '#2a2a4a',
    gap: 8,
  },
  attachBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  attachIcon: { fontSize: 20 },
  input: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 15,
    maxHeight: 120,
    borderWidth: 0.5,
    borderColor: '#2a2a4a',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#6c63ff',
    justifyContent: 'center', alignItems: 'center',
  },
  recordingBtn: { backgroundColor: '#ff4444' },
  sendIcon: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
});
