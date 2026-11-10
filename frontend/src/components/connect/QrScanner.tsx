import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import jsQR from 'jsqr';

// Reads a QR code with the camera, in the browser (no outside service).
// Needs https; the phone's own camera app works too (it opens the link).
export function QrScanner({ onRead }: { onRead: (text: string) => void }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const read = useRef(onRead);
  read.current = onRead;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t('connect.scan.unsupported'));
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch {
        setError(t('connect.scan.denied'));
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      timer = window.setInterval(() => {
        if (!ctx || video.readyState < 2) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(image.data, image.width, image.height);
        if (found?.data) read.current(found.data);
      }, 300);
    };
    void start();
    return () => {
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [t]);

  if (error) return <p className="form-error">{error}</p>;
  return <video ref={videoRef} className="qr-video" muted playsInline />;
}
