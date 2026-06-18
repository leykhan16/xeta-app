import React, { useEffect, useState, createContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { getMe } from '../services/api';

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

  const login = async (token, username) => {
    await SecureStore.setItemAsync('xeta_token', token);
    await SecureStore.setItemAsync('xeta_username', username);
    try {
      const me = await getMe();
      await SecureStore.setItemAsync('xeta_user_id', me.id);
    } catch {}
    setIsLoggedIn(true);
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
