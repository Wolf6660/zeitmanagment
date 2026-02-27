import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { BootstrapScanScreen } from "./src/screens/BootstrapScanScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { RequestsScreen } from "./src/screens/RequestsScreen";
import { MonthScreen } from "./src/screens/MonthScreen";
import { TeamScreen } from "./src/screens/TeamScreen";
import { AccountScreen } from "./src/screens/AccountScreen";
import type { ProvisioningPayload, Session, StoredProvisioning } from "./src/types/app";
import { clearSession, getProvisioning, getSession, resetAll, setProvisioning, setSession } from "./src/storage/secureStore";
import { ApiClient } from "./src/services/api";
import { colors } from "./src/theme/colors";

type TabKey = "Start" | "Antraege" | "Monat" | "Team" | "Konto";

function tabIcon(tab: TabKey): string {
  if (tab === "Start") return "^";
  if (tab === "Antraege") return "[]";
  if (tab === "Monat") return "O";
  if (tab === "Team") return "##";
  return "@";
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [provisioning, setProvisioningState] = useState<StoredProvisioning | null>(null);
  const [session, setSessionState] = useState<Session | null>(null);
  const [prefilledLoginName, setPrefilledLoginName] = useState<string>("");
  const [loginInfoText, setLoginInfoText] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabKey>("Start");

  useEffect(() => {
    Promise.all([getProvisioning(), getSession()])
      .then(([prov, sess]) => {
        setProvisioningState(prov);
        setSessionState(sess);
      })
      .finally(() => setBooting(false));
  }, []);

  const api = useMemo(() => {
    if (!provisioning) return null;
    return new ApiClient(provisioning.apiBaseUrl, session);
  }, [provisioning, session]);

  useEffect(() => {
    api?.setSession(session);
  }, [api, session]);

  if (booting) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const isLead = session?.user.role === "SUPERVISOR" || session?.user.role === "ADMIN";
  const tabs: TabKey[] = isLead ? ["Start", "Antraege", "Monat", "Team", "Konto"] : ["Start", "Antraege", "Monat", "Konto"];

  const renderAuthenticatedContent = () => {
    if (!api || !session) return null;
    if (activeTab === "Start") {
      return (
        <HomeScreen
          api={api}
          user={session.user}
          onOpenPendingRequests={() => {
            setActiveTab(isLead ? "Team" : "Antraege");
          }}
        />
      );
    }
    if (activeTab === "Antraege") return <RequestsScreen api={api} user={session.user} />;
    if (activeTab === "Monat") return <MonthScreen api={api} user={session.user} />;
    if (activeTab === "Team" && isLead) return <TeamScreen api={api} />;
    return (
      <AccountScreen
        user={session.user}
        onLogout={async () => {
          await clearSession();
          setSessionState(null);
          setActiveTab("Start");
        }}
        onResetApp={async () => {
          await resetAll();
          setSessionState(null);
          setProvisioningState(null);
          setPrefilledLoginName("");
          setLoginInfoText("");
          setActiveTab("Start");
        }}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {!provisioning ? (
        <BootstrapScanScreen
          onResolved={async (payload: ProvisioningPayload) => {
            const prov: StoredProvisioning = {
              apiBaseUrl: payload.apiBaseUrl,
              lockedAt: new Date().toISOString()
            };
            await setProvisioning(prov);
            setProvisioningState(prov);

            if (payload.loginName && payload.password) {
              const bootstrapApi = new ApiClient(payload.apiBaseUrl, null);
              const newSession = await bootstrapApi.login(payload.loginName, payload.password);
              await setSession(newSession);
              setSessionState(newSession);
              setPrefilledLoginName(payload.loginName);
              setLoginInfoText("");
              return;
            }

            setPrefilledLoginName(payload.loginName ?? "");
            setLoginInfoText("Die App ist eingerichtet. Bitte nun mit den Mitarbeiterdaten anmelden.");
          }}
        />
      ) : !session || !api ? (
        <LoginScreen
          initialLoginName={prefilledLoginName}
          infoText={loginInfoText}
          onSubmit={async (loginName, password) => {
            const newSession = await api!.login(loginName, password);
            await setSession(newSession);
            setSessionState(newSession);
            setActiveTab("Start");
          }}
          onResetApp={async () => {
            await resetAll();
            setSessionState(null);
            setProvisioningState(null);
            setPrefilledLoginName("");
            setLoginInfoText("");
            setActiveTab("Start");
          }}
        />
      ) : (
        <View style={styles.appShell}>
          <View style={styles.content}>{renderAuthenticatedContent()}</View>
          <View style={styles.tabBar}>
            {tabs.map((tab) => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
              >
                <Text style={[styles.tabIcon, activeTab === tab && styles.tabIconActive]}>{tabIcon(tab)}</Text>
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  appShell: { flex: 1 },
  content: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 6,
    paddingBottom: 8
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    gap: 2
  },
  tabButtonActive: {},
  tabIcon: { color: "#9CA3AF", fontWeight: "700", fontSize: 16, lineHeight: 18 },
  tabIconActive: { color: "#2563EB" },
  tabText: { color: "#9CA3AF", fontWeight: "500", fontSize: 11 },
  tabTextActive: { color: "#2563EB", fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  fatal: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: colors.bg },
  fatalText: { color: colors.danger, textAlign: "center" }
});
