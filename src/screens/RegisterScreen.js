import React, { useState, useContext } from 'react';
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
} from 'react-native';
import { registerUser, loginUser } from '../services/api';
import { generateKeyPair, savePrivateKey } from '../crypto/e2e';
import { AuthContext } from '../navigation/AppNavigator';

export default function RegisterScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);

  const handleRegister = async () => {
    const em = email.trim();
    const un = username.trim().toLowerCase();
    const pw = password.trim();

    if (!em || !un || !pw) {
      Alert.alert('Error', 'All fields are required');
      return;
    }
    if (pw.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const { publicKey, privateKey } = await generateKeyPair();
      await savePrivateKey(privateKey, un);

      await registerUser(em, un, pw, publicKey);

      const data = await loginUser(un, pw);
      await login(data.token, data.username);
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Registration failed';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.title}>XETA</Text>
        <Text style={styles.subtitle}>Create your account</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#888"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#888"
          value={username}
          onChangeText={(t) => setUsername(t.toLowerCase())}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#888"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCorrect={false}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>Already have an account? Login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 48, fontWeight: 'bold', color: '#ffffff', textAlign: 'center', marginBottom: 8, letterSpacing: 8 },
  subtitle: { fontSize: 16, color: '#888', textAlign: 'center', marginBottom: 40 },
  input: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 16, color: '#ffffff', fontSize: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  button: { backgroundColor: '#6c63ff', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16, marginTop: 8 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  link: { color: '#6c63ff', textAlign: 'center', fontSize: 14 },
});
