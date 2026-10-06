import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fileUrl } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export const Icon = Ionicons;

// ---------------- Toast ----------------
type ToastT = { msg: string; kind: "success" | "error" | "info" };
const ToastCtx = createContext<(msg: string, kind?: ToastT["kind"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastT | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const show = useCallback(
    (msg: string, kind: ToastT["kind"] = "success") => {
      setToast({ msg, kind });
      clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
      }, 2800);
    },
    [opacity],
  );
  const bg = toast?.kind === "error" ? colors.error : toast?.kind === "info" ? colors.surfaceInverse : colors.success;
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          testID="toast-message"
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 16,
            right: 16,
            opacity,
            backgroundColor: bg,
            borderRadius: 12,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name={toast.kind === "error" ? "alert-circle" : "checkmark-circle"} size={20} color={colors.onSuccess} />
          <Text style={{ color: colors.onSuccess, fontSize: 14, fontWeight: "600", flex: 1 }}>{toast.msg}</Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

// ---------------- Header ----------------
export function Header({
  title,
  subtitle,
  back,
  right,
  testID,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  testID?: string;
}) {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }]} testID={testID}>
      {back && (
        <Pressable
          testID="header-back-button"
          hitSlop={10}
          style={s.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Icon name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.headerSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

// ---------------- Buttons ----------------
export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  testID,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const { colors } = useTheme();
  const map = {
    primary: [colors.brandPrimary, colors.onBrandPrimary, colors.brandPrimary],
    secondary: [colors.brandTertiary, colors.onBrandTertiary, colors.brandTertiary],
    outline: [colors.surface, colors.onSurface, colors.borderStrong],
    danger: [colors.surface, colors.error, colors.error],
    ghost: ["transparent", colors.brand, "transparent"],
  } as const;
  const [bg, fg, bd] = map[variant];
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderColor: bd,
          borderWidth: 1,
          minHeight: small ? 38 : 50,
          paddingHorizontal: small ? 14 : 20,
          borderRadius: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={small ? 16 : 18} color={fg} />}
          <Text style={{ color: fg, fontWeight: "700", fontSize: small ? 13 : 15 }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ name, onPress, testID, color, badge }: { name: IconName; onPress: () => void; testID: string; color?: string; badge?: number }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <Pressable testID={testID} onPress={onPress} hitSlop={8} style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]}>
      <Icon name={name} size={22} color={color ?? colors.onSurface} />
      {!!badge && (
        <View style={s.badgeDot}>
          <Text style={s.badgeDotText}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ---------------- Inputs ----------------
export function Input({ label, error, testID, style, ...rest }: TextInputProps & { label?: string; error?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={s.inputLabel}>{label}</Text> : null}
      <TextInput
        testID={testID}
        placeholderTextColor={colors.muted}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[s.input, rest.multiline && { minHeight: 96, textAlignVertical: "top", paddingTop: 12 }, focus && { borderColor: colors.brand }, style]}
        {...rest}
      />
      {error ? <Text style={s.errorText}>{error}</Text> : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  testID,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
  icon?: IconName;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{
        height: 36,
        flexShrink: 0,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? colors.brand : colors.border,
        backgroundColor: selected ? colors.brandSecondary : colors.surface,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      {icon && <Icon name={icon} size={14} color={selected ? colors.onBrandSecondary : colors.onSurfaceTertiary} />}
      <Text style={{ fontSize: 13, fontWeight: "600", color: selected ? colors.onBrandSecondary : colors.onSurfaceTertiary }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, height: 56 }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16, alignItems: "center" }}
    >
      {children}
    </ScrollView>
  );
}

export function MultiSelect({ options, value, onChange, testIDPrefix }: { options: string[]; value: string[]; onChange: (v: string[]) => void; testIDPrefix: string }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => (
        <Chip
          key={o}
          label={o.replace(/_/g, " ")}
          testID={`${testIDPrefix}-${o.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
          selected={value.includes(o)}
          onPress={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}
        />
      ))}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange, testIDPrefix }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void; testIDPrefix: string }) {
  const s = useStyles();
  return (
    <View style={s.segment}>
      {options.map((o) => (
        <Pressable key={o.key} testID={`${testIDPrefix}-${o.key}`} onPress={() => onChange(o.key)} style={[s.segmentItem, value === o.key && s.segmentActive]}>
          <Text style={[s.segmentText, value === o.key && s.segmentTextActive]} numberOfLines={1}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------------- Display ----------------
export function Card({ children, style, onPress, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string }) {
  const s = useStyles();
  if (onPress)
    return (
      <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }, style]}>
        {children}
      </Pressable>
    );
  return (
    <View testID={testID} style={[s.card, style]}>
      {children}
    </View>
  );
}

export function Badge({ text, tone = "brand", icon, testID }: { text: string; tone?: "brand" | "success" | "warning" | "error" | "neutral" | "info"; icon?: IconName; testID?: string }) {
  const { colors } = useTheme();
  const map = {
    brand: [colors.brandTertiary, colors.onBrandTertiary],
    success: [colors.successSoft, colors.successText],
    warning: [colors.warningSoft, colors.warningText],
    error: [colors.errorSoft, colors.error],
    info: [colors.brandTertiary, colors.info],
    neutral: [colors.surfaceTertiary, colors.onSurfaceTertiary],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: "flex-start" }}>
      {icon && <Icon name={icon} size={12} color={fg} />}
      <Text style={{ color: fg, fontSize: 12, fontWeight: "700" }}>{text}</Text>
    </View>
  );
}

export function MatchBadge({ score, testID, large }: { score?: number | null; testID?: string; large?: boolean }) {
  const { colors } = useTheme();
  if (score == null) return null;
  const tone = score >= 80 ? colors.success : score >= 60 ? colors.brand : colors.warning;
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: large ? 12 : 8, paddingVertical: large ? 6 : 4, borderRadius: 999, backgroundColor: colors.brandTertiary }}>
      <Icon name="sparkles" size={large ? 16 : 12} color={tone} />
      <Text style={{ color: tone, fontWeight: "800", fontSize: large ? 16 : 12 }}>{score}% Match</Text>
    </View>
  );
}

export function VerifiedBadge({ size = 14 }: { size?: number }) {
  const { colors } = useTheme();
  return <Icon name="checkmark-circle" size={size} color={colors.info} testID="verified-badge" />;
}

export function Logo({ fileId, name, size = 44, round }: { fileId?: string | null; name?: string; size?: number; round?: boolean }) {
  const { colors } = useTheme();
  const url = fileUrl(fileId);
  const r = round ? size / 2 : 12;
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.surfaceTertiary }} contentFit="cover" cachePolicy="memory-disk" />;
  const initials = (name ?? "?").replace(/\[.*?\]\s*/, "").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.onBrandSecondary, fontWeight: "800", fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export function Progress({ value, color, height = 8 }: { value: number; color?: string; height?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height, borderRadius: height, backgroundColor: color ?? colors.brand }} />
    </View>
  );
}

export function SectionTitle({ title, action, onAction, testID }: { title: string; action?: string; onAction?: () => void; testID?: string }) {
  const s = useStyles();
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{title}</Text>
      {action && (
        <Pressable onPress={onAction} testID={testID} hitSlop={8}>
          <Text style={s.sectionAction}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------- States ----------------
export function LoadingView({ testID = "loading-state" }: { testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, minHeight: 200 }}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

export function EmptyView({ icon = "file-tray-outline", title, message, action, onAction, testID = "empty-state" }: { icon?: IconName; title: string; message?: string; action?: string; onAction?: () => void; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View testID={testID} style={s.stateWrap}>
      <View style={s.stateIcon}>
        <Icon name={icon} size={32} color={colors.brand} />
      </View>
      <Text style={s.stateTitle}>{title}</Text>
      {message ? <Text style={s.stateMsg}>{message}</Text> : null}
      {action && <Button title={action} onPress={onAction} testID={`${testID}-action`} style={{ marginTop: 8 }} />}
    </View>
  );
}

export function ErrorView({ message, onRetry, testID = "error-state" }: { message?: string; onRetry: () => void; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View testID={testID} style={s.stateWrap}>
      <View style={[s.stateIcon, { backgroundColor: colors.errorSoft }]}>
        <Icon name="cloud-offline-outline" size={32} color={colors.error} />
      </View>
      <Text style={s.stateTitle}>Something went wrong</Text>
      <Text style={s.stateMsg}>{message ?? "Unable to load. Please try again."}</Text>
      <Button title="Retry" icon="refresh" onPress={onRetry} testID="retry-button" variant="outline" style={{ marginTop: 8 }} />
    </View>
  );
}

// ---------------- Bottom sheet (modal) ----------------
export function Sheet({ visible, onClose, title, children, testID }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; testID?: string }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetBackdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} testID={`${testID}-backdrop`} />
        <View testID={testID} style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.sheetHandle} />
          <View style={s.sectionRow}>
            <Text style={s.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} testID={`${testID}-close`} hitSlop={10}>
              <Icon name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  backBtn: { width: 36, height: 44, justifyContent: "center", marginLeft: -6 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: c.onSurface, letterSpacing: -0.3 },
  headerSub: { fontSize: 13, color: c.muted, marginTop: 2 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  badgeDot: { position: "absolute", top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeDotText: { color: c.onError, fontSize: 10, fontWeight: "800" },
  inputLabel: { fontSize: 13, fontWeight: "600", color: c.onSurfaceSecondary },
  input: { minHeight: 50, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: c.onSurface, backgroundColor: c.surfaceSecondary },
  errorText: { color: c.error, fontSize: 12 },
  card: { backgroundColor: c.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border, shadowColor: c.surfaceInverse, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  segment: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: 12, padding: 4 },
  segmentItem: { flex: 1, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  segmentActive: { backgroundColor: c.surface, shadowColor: c.surfaceInverse, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  segmentText: { fontSize: 13, fontWeight: "600", color: c.muted },
  segmentTextActive: { color: c.onSurface },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: c.onSurface, letterSpacing: -0.2 },
  sectionAction: { fontSize: 14, fontWeight: "700", color: c.brand },
  stateWrap: { alignItems: "center", justifyContent: "center", padding: 32, gap: 8, minHeight: 260 },
  stateIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  stateTitle: { fontSize: 17, fontWeight: "800", color: c.onSurface, textAlign: "center" },
  stateMsg: { fontSize: 14, color: c.muted, textAlign: "center", lineHeight: 20, maxWidth: 300 },
  sheetBackdrop: { flex: 1, backgroundColor: c.scrim, justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12, maxHeight: "88%" },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: c.onSurface },
}));
