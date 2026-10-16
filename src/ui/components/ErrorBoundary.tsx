import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
  }

  handleRestart = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#0F0F0F" />
          <View style={styles.card}>
            <Text style={styles.icon}>⚠️</Text>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              SmartCalc AI encountered an unexpected display issue. Your saved data and history remain completely safe.
            </Text>
            <TouchableOpacity
              style={styles.btn}
              onPress={this.handleRestart}
              accessibilityRole="button"
              accessibilityLabel="Restart Smart Calculator"
            >
              <Text style={styles.btnText}>Restart Calculator</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1C1C1C',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2C2C29',
    padding: 24,
    alignItems: 'center',
    maxWidth: 360,
    width: '100%',
  },
  icon: {
    fontSize: 40,
    marginBottom: 12,
  },
  title: {
    color: '#F5F5F0',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    color: '#8A8982',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 20,
  },
  btn: {
    backgroundColor: '#E6D01B',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  btnText: {
    color: '#141413',
    fontSize: 14,
    fontWeight: '800',
  },
});
