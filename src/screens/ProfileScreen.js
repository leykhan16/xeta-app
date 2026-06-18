import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getMe, updateProfile, uploadImage } from '../services/api';

export default function ProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [about, setAbout] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const me = await getMe();
      setProfile(me);
      setDisplayName(me.display_name || '');
      setAbout(me.about || '');
      setAvatarUrl(me.avatar_url || null);
    } catch (error) {
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photos to set an avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const url = await uploadImage(asset.uri, asset.mimeType || 'image/jpeg');
      setAvatarUrl(url);
    } catch (error) {
      Alert.alert('Error', 'Failed to upload avatar: ' + error.message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        display_name: displayName.trim() || null,
        about: about.trim() || null,
        avatar_url: avatarUrl || null,
      });
      Alert.alert('Saved', 'Your profile has been updated', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.inner}>
        <TouchableOpacity style={styles.avatarWrap} onPress={handlePickAvatar}>
          {uploadingAvatar ? (
            <View style={styles.avatarPlaceholder}>
              <ActivityIndicator color="#6c63ff" />
            </View>
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>
                {profile?.username?.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </TouchableOpacity>

        <Text style={styles.usernameLabel}>@{profile?.username}</Text>

        <Text style={styles.label}>Display Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor="#888"
          value={displayName}
          onChangeText={setDisplayName}
          autoCorrect={false}
        />

        <Text style={styles.label}>About</Text>
        <TextInput
          style={[styles.input, styles.aboutInput]}
          placeholder="Tell people about yourself"
          placeholderTextColor="#888"
          value={about}
          onChangeText={setAbout}
          multiline
          autoCorrect={false}
        />

        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 16 },
  back: { color: '#6c63ff', fontSize: 16 },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  inner: { padding: 24, alignItems: 'center' },
  avatarWrap: { alignItems: 'center', marginBottom: 24 },
  avatarImage: { width: 100, height: 100, borderRadius: 50, marginBottom: 8 },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#6c63ff', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  avatarPlaceholderText: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
  avatarHint: { color: '#6c63ff', fontSize: 13 },
  usernameLabel: { color: '#888', fontSize: 14, marginBottom: 24 },
  label: { color: '#888', fontSize: 13, marginBottom: 6, alignSelf: 'flex-start', width: '100%' },
  input: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 16, color: '#ffffff', fontSize: 16, borderWidth: 1, borderColor: '#2a2a2a', width: '100%' },
  aboutInput: { height: 100, textAlignVertical: 'top' },
  saveButton: { backgroundColor: '#6c63ff', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, width: '100%' },
  saveButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
