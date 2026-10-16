import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ErrorBoundary } from './src/ui/components/ErrorBoundary';
import { HomeScreen } from './src/ui/screens/HomeScreen';

export default function App() {
  return (
    <ErrorBoundary>
      <StatusBar style="auto" />
      <HomeScreen />
    </ErrorBoundary>
  );
}
