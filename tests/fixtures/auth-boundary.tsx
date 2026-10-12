// Controlled SDK fixture, never imported by the production application.
import {useState} from "react";
import {createRoot} from "react-dom/client";
import {AuthProvider,useAuth} from "../../src/platform/auth";
import {PrivateProfileBoundary} from "../../src/platform/PrivateProfile";
import {usePlatform} from "../../src/platform/store";
function Probe(){
  const {state,update}=usePlatform();const {session,accepted,refresh}=useAuth();
  const [draft,setDraft]=useState("");
  return <main><h1>{session?.user.id??"guest"}</h1><p id="terms">{String(accepted)}</p><p id="private">{state.entries.map(e=>e.body).join("|")}</p>
    <input aria-label="Private draft" value={draft} onChange={e=>setDraft(e.target.value)}/>
    <button onClick={()=>{if(update(s=>({...s,entries:[{id:"fixture",title:"Synthetic",type:"free journal",date:"2026-10-07",body:draft}]})))setDraft("");}}>Save locally</button>
    <button onClick={()=>void refresh()}>Refresh terms</button>
  </main>;
}
createRoot(document.getElementById("root")!).render(<AuthProvider><PrivateProfileBoundary><Probe/></PrivateProfileBoundary></AuthProvider>);
