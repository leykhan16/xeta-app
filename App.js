import * as Notifications from 'expo-notifications';
import AppNavigator from './src/navigation/AppNavigator';

// Show notifications even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  return <AppNavigator />;
}
