import React, { useEffect, useState } from "react";
import Slider from "react-slick";
import Hls from "hls.js";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import "../styles/custom.css";
import { PlayIcon, PauseIcon } from "@heroicons/react/24/solid";
import { sendTelegramNotification } from "../utils/telegram";
import { validateVideoUrl, monitorSuspiciousActivity } from "../utils/security";

interface Video {
  videoUrl: string;
  hlsUrl: string;
  thumbnailUrl: string;
}

const videos: Video[] = [];

const App: React.FC = () => {
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const handleVisitorDetails = async () => {
      const userAgent = navigator.userAgent;
      let location = "Unknown";
      let previousSites = document.referrer || "Direct";

      try {
        const response = await fetch("https://ipapi.co/json/");
        const data = await response.json();
        location = `${data.city || "Unknown"}, ${data.country_name || "Unknown"}`;
      } catch (error) {
        console.error("Error fetching location:", error);
      }

      const visitorDetails = {
        userAgent,
        location,
        referrer: document.referrer,
        previousSites,
      };

      monitorSuspiciousActivity(visitorDetails);

      try {
        await sendTelegramNotification(visitorDetails);
      } catch (error) {
        console.error("Error sending Telegram notification:", error);
      }
    };

    handleVisitorDetails();
  }, []);

  useEffect(() => {
    videos.forEach((video) => {
      if (!validateVideoUrl(video.videoUrl) || !validateVideoUrl(video.hlsUrl)) {
        console.error(`Invalid video URL: ${video.videoUrl} or HLS URL: ${video.hlsUrl}`);
      }
    });
  }, []);

  const initializeVideo = (videoElement: HTMLVideoElement, video: Video) => {
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(video.hlsUrl);
      hls.attachMedia(videoElement);
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.warn("HLS error, falling back to MP4:", data);
          videoElement.src = video.videoUrl;
          if (isPlaying) videoElement.play().catch((e) => console.error("Play error:", e));
        }
      });
    } else if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
      videoElement.src = video.hlsUrl;
      if (isPlaying) videoElement.play().catch((e) => console.error("Play error:", e));
    } else {
      videoElement.src = video.videoUrl;
      if (isPlaying) videoElement.play().catch((e) => console.error("Play error:", e));
    }
  };

  const handleVideoClick = (video: Video, videoRef: HTMLVideoElement | null) => {
    if (!videoRef) return;

    if (playingVideo === video.hlsUrl) {
      if (isPlaying) {
        videoRef.pause();
        setIsPlaying(false);
      } else {
        videoRef.play().catch((e) => console.error("Play error:", e));
        setIsPlaying(true);
      }
    } else {
      if (playingVideo) {
        const previousVideoElement = document.querySelector(`video[src="${playingVideo}"], video[data-hls="${playingVideo}"]`) as HTMLVideoElement;
        if (previousVideoElement) {
          previousVideoElement.pause();
        }
      }

      setPlayingVideo(video.hlsUrl);
      setIsPlaying(true);
      initializeVideo(videoRef, video);
    }
  };

  const toggleFullscreen = (videoElement: HTMLVideoElement) => {
    if (!isFullscreen) {
      if (videoElement.requestFullscreen) {
        videoElement.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    setIsFullscreen(!isFullscreen);
  };

  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 5,
    slidesToScroll: 1,
    responsive: [
      {
        breakpoint: 1024,
        settings: {
          slidesToShow: 3,
          slidesToScroll: 1,
        },
      },
      {
        breakpoint: 640,
        settings: {
          slidesToShow: 1,
          slidesToScroll: 1,
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="p-4">
        <h1 className="text-3xl font-bold text-center">VideoHub</h1>
      </header>
      <main className="p-4">
        {videos.length === 0 ? (
          <p className="text-center text-gray-400">Tidak ada video yang tersedia.</p>
        ) : (
          <Slider {...settings}>
            {videos.map((video, index) => {
              const videoRef = React.createRef<HTMLVideoElement>();
              const isCurrentVideo = playingVideo === video.hlsUrl;

              return (
                <div key={index} className="relative px-2">
                  <div className="relative">
                    <video
                      ref={videoRef}
                      poster={video.thumbnailUrl}
                      className="w-full h-48 object-cover rounded-lg"
                      onClick={() => handleVideoClick(video, videoRef.current)}
                      data-hls={video.hlsUrl}
                      playsInline
                    />
                    <div
                      className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg"
                      onClick={() => handleVideoClick(video, videoRef.current)}
                    >
                      {isCurrentVideo && isPlaying ? (
                        <PauseIcon className="w-12 h-12 text-white opacity-75 hover:opacity-100" />
                      ) : (
                        <PlayIcon className="w-12 h-12 text-white opacity-75 hover:opacity-100" />
                      )}
                    </div>
                    {isCurrentVideo && (
                      <button
                        onClick={() => toggleFullscreen(videoRef.current!)}
                        className="absolute bottom-2 right-2 bg-gray-800 text-white p-1 rounded"
                      >
                        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </Slider>
        )}
      </main>
    </div>
  );
};

export default App;
