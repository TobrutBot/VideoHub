// src/security.js

// Fungsi untuk memantau aktivitas mencurigakan
const monitorSuspiciousActivity = () => {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === 'SCRIPT' || node.nodeName === 'IFRAME') {
            const src = node.src || '';
            const allowedDomains = ['localhost', 'yourdomain.com', 'dl.dropboxusercontent.com'];
            const isTrusted = allowedDomains.some((domain) => src.includes(domain));
            if (!isTrusted) {
              console.warn(`[Security Alert] Pemuatan sumber daya mencurigakan terdeteksi: ${src}`);
              node.remove(); // Hapus elemen yang mencurigakan
            }
          }
        });
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
};

// Fungsi untuk memastikan stream media dibersihkan
const cleanupMediaStream = (streamRef) => {
  if (streamRef.current) {
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    console.log('[Security] Media stream telah dibersihkan.');
  }
};

// Fungsi untuk memvalidasi URL video
const validateVideoUrl = (url) => {
  const allowedDomains = ['dl.dropboxusercontent.com', 'cdn.videy.co']; // Izinkan domain Dropbox dan cdn.videy.co
  const isValid = allowedDomains.some((domain) => url.includes(domain));
  if (!isValid) {
    console.warn(`[Security Alert] URL video tidak valid: ${url}`);
    return false;
  }
  return true;
};

// Ekspor fungsi untuk digunakan di komponen
export { monitorSuspiciousActivity, cleanupMediaStream, validateVideoUrl };
