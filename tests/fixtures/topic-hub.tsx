import {useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {AuthProvider} from "../../src/platform/auth";
import {PrivateProfileBoundary} from "../../src/platform/PrivateProfile";
import {TopicHub} from "../../src/social/TopicHub";
function Harness(){
  const [topic,setTopic]=useState("anxiety");
  useEffect(()=>{
    const change=(event:Event)=>setTopic((event as CustomEvent<string>).detail);
    window.addEventListener("fixture-topic",change);
    return ()=>window.removeEventListener("fixture-topic",change);
  },[]);
  return <AuthProvider><PrivateProfileBoundary><TopicHub id={topic}/></PrivateProfileBoundary></AuthProvider>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
