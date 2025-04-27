import React, { useState, useEffect, useRef } from 'react';
import Slider from 'react-slick';
import Hls from 'hls.js';
import { ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/solid';
import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';
import './styles/custom.css';
import { sendTelegramNotification } from './utils/telegram';
import { validateVideoUrl, monitorSuspiciousActivity } from './security';

interface Video {
  videoUrl: string;
  hlsUrl: string;
  thumbnailUrl?: string;
}

interface VisitorDetails {
  userAgent: string;
  location: string;
  referrer: string;
  previousSites: string;
}

const App: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean[]>([]);
  const [videoErrors, setVideoErrors] = useState<boolean[]>([]);
  const [loadedSlides, setLoadedSlides] = useState<number[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const sliderRef = useRef<Slider | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Array videos kosong, akan diisi oleh bot
  const videos: Video[] = [];

  const videosPerSlide = 5;
  const videoSlides = Array(Math.ceil(videos.length / videosPerSlide))
    .fill(null)
    .map((_, index) => videos.slice(index * videosPerSlide, (index + 1) * videosPerSlide));

  const sliderSettings = {
    dots: true,
    infinite: false,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: true,
    adaptiveHeight: true,
    customPaging: (i: number) => (
      <div className="w-3 h-3 rounded-full bg-gray-400 hover:bg-gray-200 transition-all duration-200"></div>
    ),
    appendDots: (dots: React.ReactNode) => (
      <div className="mt-4">
        <ul className="flex justify-center space-x-2">{dots}</ul>
      </div>
    ),
  };

  const isSafari = () => {
    const userAgent = navigator.userAgent;
    const isSafariBrowser = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
    console.log(`isSafari: ${isSafariBrowser}`);
    return isSafariBrowser;
  };

  const setupHls = (videoElement: HTMLVideoElement, hlsUrl: string, index: number) => {
    if (!validateVideoUrl(hlsUrl)) {
      console.error(`Invalid HLS URL for video ${index + 1}: ${hlsUrl}`);
      setVideoErrors((prev) => {
        const newErrors = [...prev];
        newErrors[index] = true;
        return newErrors;
      });
      setIsLoading((prev) => {
        const newLoading = [...prev];
        newLoading[index] = false;
        return newLoading;
      });
      return;
    }

    if (Hls.isSupported() && !isSafari()) {
      const hls = new Hls();
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoElement);
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error(`HLS error for video ${index + 1}:`, data);
        const errorDetails: VisitorDetails = {
          userAgent: navigator.userAgent,
          location: window.location.href,
          referrer: document.referrer || 'Langsung',
          previousSites: `App.tsx: HLS error untuk video ${index + 1}: ${data.type} - ${data.details}, URL: ${hlsUrl}`,
        };
        sendTelegramNotification(errorDetails).catch((err) =>
          console.error('Gagal mengirim log HLS error:', err.message)
        );
        setVideoErrors((prev) => {
          const newErrors = [...prev];
          newErrors[index] = true;
          return newErrors;
        });
        setIsLoading((prev) => {
          const newLoading = [...prev];
          newLoading[index] = false;
          return newLoading;
        });
      });
      videoElement.play().catch((err) => {
        console.error(`HLS play error for video ${index + 1}:`, err);
        setVideoErrors((prev) => {
          const newErrors = [...prev];
          newErrors[index] = true;
          return newErrors;
        });
        setIsLoading((prev) => {
          const newLoading = [...prev];
          newLoading[index] = false;
          return newLoading;
        });
      });
    } else if (isSafari()) {
      videoElement.src = hlsUrl;
      videoElement.load();
      videoElement.play().catch((err) => {
        console.error(`Safari HLS play error for video ${index + 1}:`, err);
        // Fallback ke MP4 jika HLS gagal
        videoElement.src = videos[index].videoUrl;
        videoElement.load();
        videoElement.play().catch((mp4Err) => {
          console.error(`MP4 fallback error for video ${index + 1}:`, mp4Err);
          setVideoErrors((prev) => {
            const newErrors = [...prev];
            newErrors[index] = true;
            return newErrors;
          });
          setIsLoading((prev) => {
            const newLoading = [...prev];
            newLoading[index] = false;
            return newLoading;
          });
        });
      });
    }
  };

  const handleVideoClick = (index: number) => {
    const videoElement = videoRefs.current[index];
    if (!videoElement) return;

    if (isPlaying === index) {
      if (videoElement.paused) {
        videoElement.play().catch((err) => console.error(`Play error for video ${index + 1}:`, err));
      } else {
        videoElement.pause();
      }
      return;
    }

    if (isPlaying !== null) {
      const prevVideo = videoRefs.current[isPlaying];
      if (prevVideo) {
        prevVideo.pause();
        prevVideo.currentTime = 0;
      }
    }

    setIsPlaying(index);
    setIsLoading((prev) => {
      const newLoading = [...prev];
      newLoading[index] = true;
      return newLoading;
    });

    const videoDetails: VisitorDetails = {
      userAgent: navigator.userAgent,
      location: window.location.href,
      referrer: document.referrer || 'Langsung',
      previousSites: `App.tsx: Video ${index + 1} diklik, URL: ${videos[index].hlsUrl}`,
    };
    sendTelegramNotification(videoDetails).catch((err) =>
      console.error('Gagal mengirim log klik video:', err.message)
    );

    monitorSuspiciousActivity(videoDetails);

    if (isSafari()) {
      console.log(`Menggunakan HLS di Safari untuk video ${index + 1}`);
      setupHls(videoElement, videos[index].hlsUrl, index);
    } else {
      setupHls(videoElement, videos[index].hlsUrl, index);
    }
  };

  const handleVideoEnded = (index: number) => {
    setIsPlaying(null);
    const videoElement = videoRefs.current[index];
    if (videoElement) {
      videoElement.currentTime = 0;
    }
  };

  const handleCanPlay = (index: number) => {
    setIsLoading((prev) => {
      const newLoading = [...prev];
      newLoading[index] = false;
      return newLoading;
    });
  };

  const handleVideoError = (index: number, event: React.SyntheticEvent<HTMLVideoElement>) => {
    console.error(`Video error for video ${index + 1}:`, event);
    const errorDetails: VisitorDetails = {
      userAgent: navigator.userAgent,
      location: window.location.href,
      referrer: document.referrer || 'Langsung',
      previousSites: `App.tsx: Video error untuk video ${index + 1}: ${event.currentTarget.error?.message}, URL: ${videos[index].hlsUrl}`,
    };
    sendTelegramNotification(errorDetails).catch((err) =>
      console.error('Gagal mengirim log video error:', err.message)
    );
    setVideoErrors((prev) => {
      const newErrors = [...prev];
      newErrors[index] = true;
      return newErrors;
    });
    setIsLoading((prev) => {
      const newLoading = [...prev];
      newLoading[index] = false;
      return newLoading;
    });
  };

  const toggleFullscreen = (index: number) => {
    const videoElement = videoRefs.current[index];
    if (!videoElement) return;

    if (!isFullscreen) {
      if (videoElement.requestFullscreen) {
        videoElement.requestFullscreen();
      } else if ((videoElement as any).webkitRequestFullscreen) {
        (videoElement as any).webkitRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const slideIndex = parseInt(entry.target.getAttribute('data-slide-index') || '0', 10);
            if (!loadedSlides.includes(slideIndex)) {
              setLoadedSlides((prev) => [...prev, slideIndex]);
            }
          }
        });
      },
      { threshold: 0.1 }
    );

    const slideElements = document.querySelectorAll('.slide-container');
    slideElements.forEach((el) => observerRef.current?.observe(el));

    return () => {
      observerRef.current?.disconnect();
    };
  }, [loadedSlides]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement || !!(document as any).webkitFullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const initialLoading = videos.map(() => false);
    const initialErrors = videos.map(() => false);
    setIsLoading(initialLoading);
    setVideoErrors(initialErrors);
  }, [videos]);

  return (
    <div className="relative min-h-screen bg-gray-900">
      <header className="relative bg-gray-800 py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-white">VideoPorn</h1>
        </div>
      </header>
      <main className="relative container mx-auto px-4 py-8">
        <div className="max-w-[1200px] mx-auto">
          {videos.length === 0 ? (
            <div className="text-center text-white">
              <p>Tidak ada video yang tersedia saat ini. Tambahkan video melalui bot Telegram.</p>
            </div>
          ) : (
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
                      {slideVideos.map((video, index) => {
                        const globalIndex = slideIndex * videosPerSlide + index;
                        const videoSource = isSafari() ? video.hlsUrl : video.videoUrl;
                        const videoType = isSafari() ? 'application/vnd.apple.mpegurl' : 'video/mp4';
                        console.log(`Rendering video ${globalIndex + 1} dengan source: ${videoSource}`);
                        const renderLog: VisitorDetails = {
                          userAgent: navigator.userAgent,
                          location: window.location.href,
                          referrer: document.referrer || 'Langsung',
                          previousSites: `App.tsx: Rendering video ${globalIndex + 1} dengan source: ${videoSource}`,
                        };
                        sendTelegramNotification(renderLog).catch((err) =>
                          console.error('Gagal mengirim log render ke Telegram:', err.message)
                        );
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
                            {video.thumbnailUrl && isPlaying !== globalIndex && !videoErrors[globalIndex] ? (
                              <img
                                src={video.thumbnailUrl}
                                alt={`Thumbnail for video ${globalIndex + 1}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
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
                                poster={video.thumbnailUrl || undefined}
                              >
                                <source src={videoSource} type={videoType} />
                              </video>
                            )}
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
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
