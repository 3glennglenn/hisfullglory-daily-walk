import {useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {AuthProvider} from "../../src/platform/auth";
import {PrivateProfileBoundary} from "../../src/platform/PrivateProfile";
import {parseRoute} from "../../src/platform/router";
import {Circles} from "../../src/social/Circles";
import "../../src/styles.css";
function Harness(){
 const [route,setRoute]=useState(()=>parseRoute(window.location.pathname,window.location.search));
 useEffect(()=>{const changed=()=>setRoute(parseRoute(window.location.pathname,window.location.search));window.addEventListener("popstate",changed);return()=>window.removeEventListener("popstate",changed);},[]);
 return <AuthProvider><PrivateProfileBoundary><div className="shell"><main><Circles key={route.id??"discovery"} slug={route.id} thread={route.thread}/></main></div></PrivateProfileBoundary></AuthProvider>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
