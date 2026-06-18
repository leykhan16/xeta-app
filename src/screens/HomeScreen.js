import React, { useEffect, useState, useContext } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { getConversations, getMe } from '../services/api';
import { AuthContext } from '../navigation/AppNavigator';

export default function HomeScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const { logout } = useContext(AuthContext);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [navigation]);

  const loadData = async () => {
    try {
      const [profile, convos] = await Promise.all([getMe(), getConversations()]);
      setMe(profile);
      setConversations(convos);
    } catch (error) {
      Alert.alert('Error', 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const renderConversation = ({ item }) => {
    const otherUserId =
      item.participant_a === me?.id ? item.participant_b : item.participant_a;
    const otherUsername = item.other_username || otherUserId.slice(0, 8);

    return (
      <TouchableOpacity
        style={styles.conversationItem}
        onPress={() =>
          navigation.navigate('Chat', {
            conversationId: item.id,
            otherUserId,
            otherUsername: item.other_username,
          })
        }
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {otherUsername.slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={styles.conversationInfo}>
          <Text style={styles.conversationId} numberOfLines={1}>
            @{otherUsername}
          </Text>
          <Text style={styles.lastMessage}>
            {item.last_message_at
              ? new Date(item.last_message_at).toLocaleDateString()
              : 'No messages yet'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>XETA</Text>
          <Text style={styles.headerSub}>@{me?.username}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Search')}
          >
            <Text style={styles.iconText}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Profile')}><Text style={styles.iconText}>👤</Text></TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
            <Text style={styles.iconText}>🚪</Text>
          </TouchableOpacity>
        </View>
      </View>

      {conversations.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No conversations yet</Text>
          <Text style={styles.emptySubtext}>
            Tap 🔍 to find someone to message
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 4,
  },
  headerSub: {
    fontSize: 13,
    color: '#6c63ff',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 8,
  },
  iconText: {
    fontSize: 22,
  },
  list: {
    padding: 16,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6c63ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  conversationInfo: {
    flex: 1,
  },
  conversationId: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  lastMessage: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  emptyText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#888',
    fontSize: 14,
  },
});
