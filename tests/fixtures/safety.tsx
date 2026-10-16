import {useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {AuthProvider} from "../../src/platform/auth";
import {SafetyControls,type TargetKind} from "../../src/social/safety";
import {BlockedAuthors} from "../../src/features/Settings";
import "../../src/styles.css";
// One post with its Report control. The test page switches the kind and the post id by events;
// the mocked session and the community_safety_action answers are driven through window.safetyFixture.
function Harness(){
  const [kind,setKind]=useState<TargetKind>("post");
  const [id,setId]=useState("d0000000-0000-4000-8000-000000000001");
  useEffect(()=>{
    const changeKind=(event:Event)=>setKind((event as CustomEvent<TargetKind>).detail);
    const changeId=(event:Event)=>setId((event as CustomEvent<string>).detail);
    window.addEventListener("fixture-kind",changeKind);
    window.addEventListener("fixture-id",changeId);
    return ()=>{window.removeEventListener("fixture-kind",changeKind);window.removeEventListener("fixture-id",changeId);};
  },[]);
  return <AuthProvider><div className="shell"><main id="main" tabIndex={-1}>
    <article className="card"><p>Synthetic fixture post</p><SafetyControls id={id} kind={kind} onChange={()=>{(window as unknown as {safetyFixture:{changed:number}}).safetyFixture.changed++;}}/></article>
    <BlockedAuthors/>
  </main></div></AuthProvider>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
