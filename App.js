import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CORES } from './src/constants/CORES';

import LoginScreen from './src/screens/LoginScreen';
import ListaServicosScreen from './src/screens/ListaServicosScreen';
import DetalheServicoScreen from './src/screens/DetalheServicoScreen';
import ExecucaoScreen from './src/screens/ExecucaoScreen';
import MapaServicosScreen from './src/screens/MapaServicosScreen';
import LevantamentoFormScreen from './src/screens/LevantamentoFormScreen';
import MeusLevantamentosScreen from './src/screens/MeusLevantamentosScreen';

const Stack = createStackNavigator();

function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CORES.bgGlobal }}>
        <ActivityIndicator size="large" color={CORES.azulAcao} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: CORES.primario },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: 'bold' },
        cardStyle: { backgroundColor: CORES.bgGlobal },
      }}
    >
      {!user ? (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="ListaServicos"
            component={ListaServicosScreen}
            options={{ title: 'Serviços' }}
          />
          <Stack.Screen
            name="DetalheServico"
            component={DetalheServicoScreen}
            options={{ title: 'Detalhe do Serviço' }}
          />
          <Stack.Screen
            name="Execucao"
            component={ExecucaoScreen}
            options={{ title: 'Execução' }}
          />
          <Stack.Screen
            name="MapaServicos"
            component={MapaServicosScreen}
            options={{ title: 'Mapa de Serviços' }}
          />
          <Stack.Screen
            name="LevantamentoForm"
            component={LevantamentoFormScreen}
            options={{ title: 'Levantamento de Campo' }}
          />
          <Stack.Screen
            name="MeusLevantamentos"
            component={MeusLevantamentosScreen}
            options={{ title: 'Meus Levantamentos' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <AppNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
