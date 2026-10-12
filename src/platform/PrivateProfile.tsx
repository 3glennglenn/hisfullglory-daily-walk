import type { ReactNode } from "react";
import { useAuth } from "./auth";
import { PlatformProvider } from "./store";
export function PrivateProfileBoundary({children}:{children:ReactNode}) {
  const {session,ready}=useAuth();
  if(!ready)return <main className="shell"><h1>Opening your private profile</h1><p role="status">Waiting for authentication. Private data stays hidden.</p><button onClick={()=>location.reload()}>Retry</button></main>;
  return <PlatformProvider key={session?.user.id??"guest"} userId={session?.user.id??null}>{children}</PlatformProvider>;
}
