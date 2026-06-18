import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { searchUsers, getUserPublicKey, sendMessage } from '../services/api';
import * as SecureStore from 'expo-secure-store';
import { encryptMessage } from '../crypto/e2e';

export default function SearchScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [messaging, setMessaging] = useState(null);

  const handleSearch = async (text) => {
    setQuery(text);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const users = await searchUsers(text);
      setResults(users);
    } catch (error) {
      Alert.alert('Error', 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleStartChat = async (user) => {
    setMessaging(user.id);
    try {
      const keyData = await getUserPublicKey(user.username);

      const myUsername = await SecureStore.getItemAsync('xeta_username');
      const myPrivateKey = await SecureStore.getItemAsync(`xeta_private_key_${myUsername}`);

      if (!myPrivateKey) {
        Alert.alert('Error', 'Your encryption key is missing. Please log out and register again.');
        return;
      }

      const { ciphertext, nonce } = await encryptMessage(
        '👋 Hey!',
        keyData.public_key,
        myPrivateKey
      );

      const message = await sendMessage(user.id, ciphertext, nonce);

      navigation.navigate('Chat', {
        conversationId: message.conversation_id,
        otherUserId: user.id,
        otherUsername: user.username,
      });
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Failed to start conversation';
      Alert.alert('Error', msg);
    } finally {
      setMessaging(null);
    }
  };

  const renderUser = ({ item }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => handleStartChat(item)}
      disabled={messaging === item.id}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {item.username.slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.username}>@{item.username}</Text>
        <Text style={styles.email}>{item.email}</Text>
      </View>
      {messaging === item.id ? (
        <ActivityIndicator color="#6c63ff" />
      ) : (
        <Text style={styles.chatIcon}>💬</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find People</Text>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by username or email..."
        placeholderTextColor="#888"
        value={query}
        onChangeText={handleSearch}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={true}
      />

      {loading ? (
        <ActivityIndicator size="large" color="#6c63ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            query.length >= 2 ? (
              <Text style={styles.emptyText}>No users found</Text>
            ) : (
              <Text style={styles.emptyText}>Type at least 2 characters</Text>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 16 },
  back: { color: '#6c63ff', fontSize: 16 },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  searchInput: { backgroundColor: '#1a1a1a', margin: 16, borderRadius: 12, padding: 16, color: '#ffffff', fontSize: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  list: { padding: 16 },
  userItem: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#1a1a1a', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#2a2a2a' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#6c63ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  userInfo: { flex: 1 },
  username: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  email: { color: '#888', fontSize: 13, marginTop: 2 },
  chatIcon: { fontSize: 20 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 14 },
});
