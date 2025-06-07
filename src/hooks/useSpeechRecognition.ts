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

  useEffect(() => {
    if (isInitializedRef.current) return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      console.log('Speech Recognition destekleniyor');
      setIsSupported(true);
      
      try {
        recognitionRef.current = new SpeechRecognition();
        const recognition = recognitionRef.current;
        
        recognition.continuous = false; // Tek seferde dinle
        recognition.interimResults = true;
        recognition.lang = 'tr-TR';
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          console.log('Ses tanıma başladı');
          setIsListening(true);
          setTranscript('');
          setFinalTranscript('');
        };

        recognition.onend = () => {
          console.log('Ses tanıma bitti');
          setIsListening(false);
          
          // Eğer final transcript varsa callback'i çağır
          const fullTranscript = finalTranscript.trim();
          if (fullTranscript && onSpeechEndRef.current) {
            console.log('Final transcript:', fullTranscript);
            onSpeechEndRef.current(fullTranscript);
            setFinalTranscript('');
            setTranscript('');
          }
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let interimTranscript = '';
          let currentFinalTranscript = '';
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcriptText = result[0].transcript;
            
            if (result.isFinal) {
              currentFinalTranscript += transcriptText;
              console.log('Final result:', transcriptText);
            } else {
              interimTranscript += transcriptText;
              console.log('Interim result:', transcriptText);
            }
          }
          
          if (currentFinalTranscript) {
            setFinalTranscript(prev => prev + currentFinalTranscript);
          }
          setTranscript(interimTranscript);

          // Silence timer'ı temizle ve yeniden başlat
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          // 3 saniye sessizlik sonrası durdur
          silenceTimerRef.current = setTimeout(() => {
            if (recognitionRef.current && isListening) {
              console.log('Sessizlik nedeniyle durduruluyor');
              recognition.stop();
            }
          }, 3000);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error, event.message);
          setIsListening(false);
          
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          // Bazı hataları yoksay ve tekrar dene
          if (event.error === 'no-speech' || event.error === 'audio-capture') {
            console.log('Ses algılanamadı, tekrar deneniyor...');
            // Kısa bir süre sonra tekrar başlat
            setTimeout(() => {
              if (onSpeechEndRef.current) {
                startListening(onSpeechEndRef.current);
              }
            }, 1000);
          }
        };

        isInitializedRef.current = true;
      } catch (error) {
        console.error('Speech Recognition başlatılamadı:', error);
        setIsSupported(false);
      }
    } else {
      console.log('Speech Recognition desteklenmiyor');
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  const startListening = useCallback((onSpeechEnd?: (text: string) => void) => {
    if (!recognitionRef.current || !isSupported) {
      console.log('Speech Recognition mevcut değil');
      return;
    }

    if (isListening) {
      console.log('Zaten dinleniyor');
      return;
    }

    try {
      onSpeechEndRef.current = onSpeechEnd || null;
      setTranscript('');
      setFinalTranscript('');
      
      console.log('Ses tanıma başlatılıyor...');
      recognitionRef.current.start();
    } catch (error) {
      console.error('Ses tanıma başlatılamadı:', error);
      setIsListening(false);
    }
  }, [isListening, isSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      console.log('Ses tanıma durduruluyor...');
      recognitionRef.current.stop();
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setFinalTranscript('');
  }, []);

  return {
    isListening,
    transcript: finalTranscript + transcript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript
  };
};