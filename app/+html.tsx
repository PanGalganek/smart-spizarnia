import { PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#2E7D32" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Spiżarnia" />
        <link rel="manifest" href="/smart-spizarnia/manifest.json" />
        <link rel="apple-touch-icon" href="/smart-spizarnia/icon-192.png" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body, #root { width: 100%; height: var(--app-height, 100dvh); min-height: 0; }
          body { overscroll-behavior-y: none; }
        ` }} />
        <script dangerouslySetInnerHTML={{ __html: `
          (function () {
            function updateHeight() {
              var height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
              document.documentElement.style.setProperty('--app-height', height + 'px');
            }
            updateHeight();
            window.addEventListener('resize', updateHeight);
            if (window.visualViewport) {
              window.visualViewport.addEventListener('resize', updateHeight);
              window.visualViewport.addEventListener('scroll', updateHeight);
            }
          })();
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
