// src/security.ts

// Fungsi untuk memantau aktivitas mencurigakan
const monitorSuspiciousActivity = (): void => {
  const observer = new MutationObserver((mutations: MutationRecord[]) => {
    mutations.forEach((mutation: MutationRecord) => {
      if (mutation.addedNodes.length) {
        mutation.addedNodes.forEach((node: Node) => {
          if (node.nodeName === 'SCRIPT' || node.nodeName === 'IFRAME') {
            const src = (node as HTMLScriptElement | HTMLIFrameElement).src || '';
            const allowedDomains = ['localhost', 'yourdomain.com', 'dl.dropboxusercontent.com'];
            const isTrusted = allowedDomains.some((domain: string) => src.includes(domain));
            if (!isTrusted) {
              console.warn(`[Security Alert] Pemuatan sumber daya mencurigakan terdeteksi: ${src}`);
              (node as HTMLElement).remove(); // Hapus elemen yang mencurigakan
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
const cleanupMediaStream = (streamRef: React.MutableRefObject<MediaStream | null>): void => {
  if (streamRef.current) {
    streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    streamRef.current = null;
    console.log('[Security] Media stream telah dibersihkan.');
  }
};

// Fungsi untuk memvalidasi URL vidio
const validateVideoUrl = (url: string): boolean => {
  const allowedDomains = [
    'dl.dropboxusercontent.com',
    'cdn.videy.co',
    'video.twimg.com',
    'hlsvidiobucket.s3.ap-southeast-2.amazonaws.com', // Tambahkan domain baru
  ];
  const isValid = allowedDomains.some((domain: string) => url.includes(domain));
  if (!isValid) {
    console.warn(`[Security Alert] URL video tidak valid: ${url}`);
    return false;
  }
  return true;
};

// Ekspor fungsi untuk digunakan di komponen
export { monitorSuspiciousActivity, cleanupMediaStream, validateVideoUrl };
