import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const usesNativeTabs = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

// Bottom padding for content inside tab screens (NativeTabs float over content).
export function useBottomChrome() {
  const insets = useSafeAreaInsets();
  return usesNativeTabs ? insets.bottom : 0;
}
