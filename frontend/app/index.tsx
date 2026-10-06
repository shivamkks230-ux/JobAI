import { ActivityIndicator, View } from "react-native";

import { useTheme } from "@/src/theme";

// The root Gate redirects from here based on auth state and role.
export default function Index() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}
