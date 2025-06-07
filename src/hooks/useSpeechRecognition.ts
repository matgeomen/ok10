import { useState, useEffect, useRef, useCallback } from 'react';

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export const useSpeechRecognition = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onSpeechEndRef = useRef<((text: string) => void) | null>(null);
  const isInitializedRef = useRef(false);
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isInitializedRef.current) return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      console.log('🎤 Speech Recognition destekleniyor');
      setIsSupported(true);
      
      try {
        recognitionRef.current = new SpeechRecognition();
        const recognition = recognitionRef.current;
        
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'tr-TR';
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          console.log('🎤 Ses tanıma başladı - Konuşmaya başlayın...');
          setIsListening(true);
          setTranscript('');
          setFinalTranscript('');
          
          // Silence timer'ı başlat
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          
          silenceTimerRef.current = setTimeout(() => {
            console.log('⏰ Sessizlik nedeniyle durduruluyor...');
            if (recognitionRef.current) {
              recognition.stop();
            }
          }, 5000); // 5 saniye sessizlik
        };

        recognition.onend = () => {
          console.log('🛑 Ses tanıma bitti');
          setIsListening(false);
          
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          
          // Final transcript varsa gönder
          const fullTranscript = finalTranscript.trim();
          if (fullTranscript && onSpeechEndRef.current) {
            console.log('📤 Mesaj gönderiliyor:', fullTranscript);
            onSpeechEndRef.current(fullTranscript);
            setFinalTranscript('');
            setTranscript('');
          } else if (onSpeechEndRef.current) {
            // Hiç konuşma algılanmadıysa tekrar dinlemeye başla
            console.log('🔄 Hiç konuşma algılanmadı, tekrar dinlemeye başlanıyor...');
            if (restartTimerRef.current) {
              clearTimeout(restartTimerRef.current);
            }
            restartTimerRef.current = setTimeout(() => {
              startListening(onSpeechEndRef.current!);
            }, 1500);
          }
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let interimTranscript = '';
          let currentFinalTranscript = '';
          
          // Silence timer'ı sıfırla - konuşma algılandı
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcriptText = result[0].transcript.trim();
            
            if (result.isFinal) {
              currentFinalTranscript += transcriptText;
              console.log('✅ Final sonuç:', transcriptText);
            } else {
              interimTranscript += transcriptText;
              console.log('⏳ Geçici sonuç:', transcriptText);
            }
          }
          
          if (currentFinalTranscript) {
            setFinalTranscript(prev => prev + ' ' + currentFinalTranscript);
            // Final sonuç geldi, kısa süre sonra durdur
            silenceTimerRef.current = setTimeout(() => {
              console.log('✅ Final sonuç alındı, durduruluyor...');
              if (recognitionRef.current) {
                recognition.stop();
              }
            }, 1000);
          } else {
            setTranscript(interimTranscript);
            // Interim sonuç için daha uzun süre bekle
            silenceTimerRef.current = setTimeout(() => {
              console.log('⏰ Sessizlik nedeniyle durduruluyor...');
              if (recognitionRef.current) {
                recognition.stop();
              }
            }, 3000);
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('❌ Speech recognition hatası:', event.error, event.message);
          setIsListening(false);
          
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          // Belirli hatalarda tekrar dene
          if (event.error === 'no-speech' || event.error === 'audio-capture') {
            console.log('🔄 Ses algılanamadı, tekrar deneniyor...');
            if (onSpeechEndRef.current) {
              if (restartTimerRef.current) {
                clearTimeout(restartTimerRef.current);
              }
              restartTimerRef.current = setTimeout(() => {
                startListening(onSpeechEndRef.current!);
              }, 2000);
            }
          } else if (event.error === 'not-allowed') {
            console.error('🚫 Mikrofon izni reddedildi');
          } else if (event.error === 'network') {
            console.error('🌐 Ağ hatası');
          }
        };

        isInitializedRef.current = true;
      } catch (error) {
        console.error('❌ Speech Recognition başlatılamadı:', error);
        setIsSupported(false);
      }
    } else {
      console.log('❌ Speech Recognition desteklenmiyor');
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
    };
  }, []);

  const startListening = useCallback((onSpeechEnd?: (text: string) => void) => {
    if (!recognitionRef.current || !isSupported) {
      console.log('❌ Speech Recognition mevcut değil');
      return;
    }

    if (isListening) {
      console.log('⚠️ Zaten dinleniyor');
      return;
    }

    try {
      onSpeechEndRef.current = onSpeechEnd || null;
      setTranscript('');
      setFinalTranscript('');
      
      console.log('🚀 Ses tanıma başlatılıyor...');
      recognitionRef.current.start();
    } catch (error) {
      console.error('❌ Ses tanıma başlatılamadı:', error);
      setIsListening(false);
      
      // Hata durumunda tekrar dene
      if (onSpeechEnd) {
        if (restartTimerRef.current) {
          clearTimeout(restartTimerRef.current);
        }
        restartTimerRef.current = setTimeout(() => {
          startListening(onSpeechEnd);
        }, 2000);
      }
    }
  }, [isListening, isSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      console.log('🛑 Ses tanıma manuel olarak durduruluyor...');
      recognitionRef.current.stop();
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
    }
    onSpeechEndRef.current = null;
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setFinalTranscript('');
  }, []);

  return {
    isListening,
    transcript: (finalTranscript + ' ' + transcript).trim(),
    isSupported,
    startListening,
    stopListening,
    resetTranscript
  };
};