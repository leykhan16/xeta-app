import React, { useEffect, useState, createContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { getMe } from '../services/api';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import RegisterScreen from '../screens/RegisterScreen';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import ChatScreen from '../screens/ChatScreen';
import SearchScreen from '../screens/SearchScreen';
import ProfileScreen from '../screens/ProfileScreen';

export const AuthContext = createContext(null);

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkToken();
  }, []);

  const checkToken = async () => {
    const token = await SecureStore.getItemAsync('xeta_token');
    setIsLoggedIn(!!token);
    setLoading(false);
  };

  const registerPushToken = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: 'e8996086-9ee6-433e-91fd-296af1027b3b',
      });

      const pushToken = tokenData.data;
      await SecureStore.setItemAsync('xeta_push_token', pushToken);

      // Save to backend
      const authToken = await SecureStore.getItemAsync('xeta_token');
      await fetch('https://xeta-backend.onrender.com/push-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token: pushToken }),
      });
    } catch (e) {
      console.log('Push token error:', e.message);
    }
  };

  const login = async (token, username) => {
    await SecureStore.setItemAsync('xeta_token', token);
    await SecureStore.setItemAsync('xeta_username', username);
    try {
      const me = await getMe();
      await SecureStore.setItemAsync('xeta_user_id', me.id);
    } catch {}
    setIsLoggedIn(true);
    registerPushToken();
  };

  const logout = async () => {
    // Only clear auth tokens — private key stays on device
    await SecureStore.deleteItemAsync('xeta_token');
    await SecureStore.deleteItemAsync('xeta_username');
    await SecureStore.deleteItemAsync('xeta_user_id');
    setIsLoggedIn(false);
  };

  if (loading) return null;

  return (
    <AuthContext.Provider value={{ login, logout }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {isLoggedIn ? (
            <>
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen name="Chat" component={ChatScreen} />
              <Stack.Screen name="Search" component={SearchScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
}
