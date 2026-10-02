import { Suspense } from "react";
import { ConnectAgentClient } from "./ConnectAgentClient";
import { PhoneShell } from "@/components/PhoneShell";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default function ConnectAgentPage() {
  return (
    <PhoneShell label="Connect your agent">
      <AppHeader />
      <Suspense fallback={null}>
        <ConnectAgentClient />
      </Suspense>
    </PhoneShell>
  );
}
