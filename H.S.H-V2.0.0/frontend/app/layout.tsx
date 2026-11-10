import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import SyncInitializer from "../src/services/sync/SyncInitializer";
import { RvbAuthProvider } from "../src/contexts/RvbAuthContext";

export const metadata: Metadata = {
  title: "Hebrih Slaughter House",
  description: "Hebrih Slaughter House Management System",
};

const themeInitScript = `!function(){try{var k="hebrih-theme",s=localStorage.getItem(k),t=s==="dark"?"dark":"light",d=document.documentElement;d.setAttribute("data-theme",t);d.dataset.theme=t;d.classList.remove("themeLight","themeDark");d.classList.add(t==="dark"?"themeDark":"themeLight");d.style.colorScheme=t}catch(e){}}();`;

const languageInitScript = `!function(){try{var l=null;try{l=localStorage.getItem("rvb-ui-language")||localStorage.getItem("hebrih-language")}catch(e){}if(l!=="ar"&&l!=="fr"&&l!=="en"){l="en"}try{var d=document.documentElement;d.setAttribute("lang",l);d.setAttribute("dir",l==="ar"?"rtl":"ltr")}catch(e){}}catch(e){}}();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning data-theme="light">
      <head>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Script id="language-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: languageInitScript }} />
      </head>
      <body>
        <RvbAuthProvider>
          <SyncInitializer />
          {children}
        </RvbAuthProvider>
      </body>
    </html>
  );
}
