import { Component, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Crash Report</Text>
        <ScrollView style={styles.scroll}>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Text style={styles.stack}>{this.state.error.stack}</Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 20,
    paddingTop: 60,
  },
  title: {
    color: "#ff4444",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  scroll: { flex: 1 },
  message: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  stack: {
    color: "#aaa",
    fontSize: 11,
    fontFamily: "monospace",
  },
});
