import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import { Bot, Send, Image as ImageIcon, FileText, RotateCcw, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { ChatMessage, ChatAttachment, Source } from './types';
import { sendChatMessage, ChatApiError } from './api';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [mode, setMode] = useState<'query' | 'chat'>('chat');
  const [sources, setSources] = useState<Source[]>([]);
  const [showSources, setShowSources] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const voiceModeActiveRef = useRef(false);

  // Speech hooks
  const {
    isListening,
    transcript,
    isSupported: speechRecognitionSupported,
    startListening,
    stopListening,
    resetTranscript
  } = useSpeechRecognition();

  const {
    speak,
    stop: stopSpeaking,
    isSpeaking,
    isSupported: speechSynthesisSupported
  } = useSpeechSynthesis();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Voice mode ref'i güncelle
  useEffect(() => {
    voiceModeActiveRef.current = isVoiceMode;
  }, [isVoiceMode]);

  // Handle voice conversation flow
  const handleVoiceConversation = async (spokenText: string) => {
    if (!spokenText.trim()) {
      console.log('🔄 Boş metin, tekrar dinlemeye başlanıyor...');
      if (voiceModeActiveRef.current) {
        setTimeout(() => {
          startListening(handleVoiceConversation);
        }, 1500);
      }
      return;
    }

    console.log('🎤 Sesli mesaj alındı:', spokenText);

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      message: spokenText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    stopSpeaking(); // Mevcut konuşmayı durdur

    try {
      const data = await sendChatMessage(
        spokenText,
        mode,
        'user-session-1'
      );
      
      const botMessage: ChatMessage = {
        id: data.id || Date.now().toString(),
        type: 'bot',
        message: data.textResponse,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, botMessage]);
      
      // Update sources if available
      if (data.sources && data.sources.length > 0) {
        setSources(data.sources);
      } else {
        setSources([]);
      }

      // Yanıtı sesli oku ve ardından tekrar dinlemeye başla
      if (data.textResponse && voiceModeActiveRef.current) {
        console.log('🔊 Yanıt okunuyor:', data.textResponse.substring(0, 50) + '...');
        speak(data.textResponse, () => {
          // Konuşma bittikten sonra tekrar dinlemeye başla
          if (voiceModeActiveRef.current) {
            console.log('✅ Yanıt okundu, tekrar dinlemeye başlanıyor...');
            setTimeout(() => {
              startListening(handleVoiceConversation);
            }, 1000);
          }
        });
      } else if (voiceModeActiveRef.current) {
        // Yanıt yoksa direkt dinlemeye devam et
        console.log('🔄 Yanıt yok, direkt dinlemeye devam ediliyor...');
        setTimeout(() => {
          startListening(handleVoiceConversation);
        }, 1000);
      }
      
    } catch (error) {
      const errorMessage = error instanceof ChatApiError 
        ? error.message 
        : 'Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.';

      console.error('❌ API Hatası:', error instanceof ChatApiError ? error.message : error);
      
      const botMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'bot',
        message: errorMessage,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMessage]);

      // Hata durumunda da sesli modu devam ettir
      if (voiceModeActiveRef.current) {
        console.log('🔄 Hata sonrası tekrar dinlemeye başlanıyor...');
        setTimeout(() => {
          startListening(handleVoiceConversation);
        }, 2000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Lütfen sadece resim dosyası yükleyin.');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const contentString = reader.result as string;
        setAttachment({
          name: file.name,
          mime: file.type,
          contentString
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Dosya yükleme hatası:', error);
      alert('Dosya yüklenirken bir hata oluştu.');
    }
  };

  const handleResetChat = async () => {
    if (isLoading) return;
    
    console.log('🔄 Chat sıfırlanıyor...');
    setMessages([]);
    setSources([]);
    setShowSources(false);
    setIsVoiceMode(false);
    voiceModeActiveRef.current = false;
    stopSpeaking();
    stopListening();
    
    // Send a reset request to the API
    try {
      await sendChatMessage('', mode, 'user-session-1', undefined, true);
    } catch (error) {
      console.error('Chat sıfırlama hatası:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() && !attachment) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      message: input,
      timestamp: new Date(),
      attachment: attachment || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsLoading(true);
    stopSpeaking();

    try {
      const data = await sendChatMessage(
        input,
        mode,
        'user-session-1',
        attachment ? [attachment] : undefined
      );
      
      const botMessage: ChatMessage = {
        id: data.id || Date.now().toString(),
        type: 'bot',
        message: data.textResponse,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, botMessage]);
      
      // Update sources if available
      if (data.sources && data.sources.length > 0) {
        setSources(data.sources);
      } else {
        setSources([]);
      }

      // Auto-speak the response if enabled
      if (autoSpeak && data.textResponse) {
        setTimeout(() => {
          speak(data.textResponse);
        }, 500);
      }
      
    } catch (error) {
      const errorMessage = error instanceof ChatApiError 
        ? error.message 
        : 'Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.';

      console.error('Hata:', error instanceof ChatApiError ? error.message : error);
      
      const botMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'bot',
        message: errorMessage,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceToggle = () => {
    if (isVoiceMode) {
      // Stop voice mode
      console.log('🛑 Sesli mod kapatılıyor...');
      setIsVoiceMode(false);
      voiceModeActiveRef.current = false;
      stopListening();
      stopSpeaking();
    } else {
      // Start voice mode
      console.log('🚀 Sesli mod başlatılıyor...');
      setIsVoiceMode(true);
      voiceModeActiveRef.current = true;
      // Kısa bir gecikme ile başlat
      setTimeout(() => {
        startListening(handleVoiceConversation);
      }, 500);
    }
  };

  const handleSpeakMessage = (message: string) => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      speak(message);
    }
  };

  // Update input when transcript changes (for manual voice input)
  useEffect(() => {
    if (transcript && !isVoiceMode) {
      setInput(transcript);
      resetTranscript();
    }
  }, [transcript, isVoiceMode, resetTranscript]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="w-full relative h-[10vh] min-h-[80px] max-h-[100px] flex-shrink-0">
        <img
          src="/header.jpg"
          className="w-full h-full object-cover"
          alt="Header"
        />
        <div 
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: 'linear-gradient(to bottom, rgba(0, 51, 102, 0.85), rgba(0, 102, 204, 0.75))'
          }}
        >
          <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-white drop-shadow-lg tracking-wider">
            TURGUT ÖZAL KAİHL
          </h1>
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-4 flex flex-col min-h-0">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 flex flex-col flex-1 min-h-0">
          {/* Control Panel */}
          <div className="border-b border-gray-200 p-4 bg-gray-50 rounded-t-2xl flex-shrink-0">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">Mod:</span>
                <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setMode('chat')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      mode === 'chat'
                        ? 'bg-[#003366] text-white'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => setMode('query')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      mode === 'query'
                        ? 'bg-[#003366] text-white'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Query
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Voice Mode Toggle */}
                {speechRecognitionSupported && speechSynthesisSupported && (
                  <button
                    onClick={handleVoiceToggle}
                    disabled={isLoading}
                    className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors font-medium ${
                      isVoiceMode
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={isVoiceMode ? 'Sesli konuşmayı durdur' : 'Sesli konuşma başlat'}
                  >
                    {isVoiceMode ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {isVoiceMode ? 'Sesli Mod Aktif' : 'Sesli Konuşma'}
                  </button>
                )}
                
                {/* Auto Speak Toggle */}
                {speechSynthesisSupported && (
                  <button
                    onClick={() => setAutoSpeak(!autoSpeak)}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      autoSpeak
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                    title={autoSpeak ? 'Otomatik konuşmayı kapat' : 'Otomatik konuşmayı aç'}
                  >
                    {autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    Otomatik Ses
                  </button>
                )}
                
                {sources.length > 0 && (
                  <button
                    onClick={() => setShowSources(!showSources)}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    Kaynaklar ({sources.length})
                  </button>
                )}
                <button
                  onClick={handleResetChat}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-4 h-4" />
                  Sıfırla
                </button>
              </div>
            </div>
            
            {/* Mode Description */}
            <div className="mt-3 text-xs text-gray-600">
              {mode === 'chat' 
                ? 'Chat modu: Genel bilgi ve özel verilerle yanıt verir, sohbet geçmişini hatırlar.'
                : 'Query modu: Sadece veritabanındaki ilgili kaynaklardan yanıt verir, geçmiş hatırlanmaz.'
              }
            </div>

            {/* Voice Status */}
            {(speechRecognitionSupported || speechSynthesisSupported) && (
              <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                {speechRecognitionSupported && (
                  <span className="flex items-center gap-1">
                    <Mic className="w-3 h-3" />
                    Ses tanıma: {speechRecognitionSupported ? 'Destekleniyor' : 'Desteklenmiyor'}
                  </span>
                )}
                {speechSynthesisSupported && (
                  <span className="flex items-center gap-1">
                    <Volume2 className="w-3 h-3" />
                    Sesli okuma: {speechSynthesisSupported ? 'Destekleniyor' : 'Desteklenmiyor'}
                  </span>
                )}
              </div>
            )}

            {/* Voice Mode Status */}
            {isVoiceMode && (
              <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  {isListening && (
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  )}
                  {isSpeaking && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  )}
                  {isLoading && (
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                  )}
                  <span className="text-sm text-green-700 font-medium">
                    {isListening ? '🎤 Dinleniyor... Konuşun!' : 
                     isSpeaking ? '🔊 Yanıt okunuyor...' : 
                     isLoading ? '⏳ Yanıt hazırlanıyor...' : 
                     '✅ Hazır - Konuşmaya başlayın'}
                  </span>
                </div>
                <p className="text-xs text-green-600">
                  🔄 Otomatik döngü: Konuş → Gönder → Yanıt al → Oku → Tekrar dinle
                </p>
              </div>
            )}
          </div>

          {/* Sources Panel */}
          {showSources && sources.length > 0 && (
            <div className="border-b border-gray-200 p-4 bg-blue-50 max-h-48 overflow-y-auto flex-shrink-0">
              <h3 className="font-medium text-blue-900 mb-3">Kullanılan Kaynaklar:</h3>
              <div className="space-y-2">
                {sources.map((source, index) => (
                  <div key={index} className="bg-white p-3 rounded-lg border border-blue-200">
                    <div className="font-medium text-blue-800 text-sm mb-1">{source.title}</div>
                    <div className="text-xs text-gray-600 line-clamp-3">{source.chunk}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
            {messages.length === 0 && (
              <div className="text-center text-gray-600 py-8">
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 shadow-lg">
                  <Bot className="w-12 h-12 mx-auto mb-4 text-[#003366]" />
                  <p className="text-xl sm:text-2xl font-medium mb-3">Merhaba! Size nasıl yardımcı olabilirim?</p>
                  <p className="text-gray-500">Herhangi bir sorunuzu yanıtlamaya hazırım.</p>
                  {speechRecognitionSupported && speechSynthesisSupported && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-700 font-medium">🎤 Sesli Konuşma Özelliği</p>
                      <p className="text-xs text-blue-600 mt-1">
                        "Sesli Konuşma" butonuna basarak sürekli sesli sohbet edebilirsiniz!<br/>
                        Konuş → Otomatik gönder → Yanıt al → Otomatik oku → Tekrar dinle
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`mb-4 flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 ${
                    msg.type === 'user'
                      ? 'bg-[#003366] text-white shadow-lg'
                      : 'bg-gray-50 border border-gray-200 text-gray-800'
                  }`}
                >
                  {msg.type === 'bot' && (
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <Bot className="w-5 h-5 mr-2 text-[#003366]" />
                        <span className="font-medium text-[#003366]">Asistan</span>
                      </div>
                      {speechSynthesisSupported && !isVoiceMode && (
                        <button
                          onClick={() => handleSpeakMessage(msg.message)}
                          className="p-1 text-[#003366] hover:bg-gray-200 rounded transition-colors"
                          title={isSpeaking ? 'Konuşmayı durdur' : 'Sesli oku'}
                        >
                          {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                  {msg.attachment && (
                    <div className="mt-2">
                      <img 
                        src={msg.attachment.contentString} 
                        alt={msg.attachment.name}
                        className="max-w-full rounded-lg"
                      />
                    </div>
                  )}
                  <span className="text-xs opacity-75 mt-2 block">
                    {msg.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start mb-4">
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <div className="flex items-center">
                    <Bot className="w-5 h-5 mr-2 text-[#003366]" />
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-[#003366] rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-[#003366] rounded-full animate-bounce delay-150"></div>
                      <div className="w-2 h-2 bg-[#003366] rounded-full animate-bounce delay-300"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area - Hidden in voice mode */}
          {!isVoiceMode && (
            <div className="border-t border-gray-200 p-4 bg-white rounded-b-2xl flex-shrink-0">
              {attachment && (
                <div className="mb-2 p-2 bg-gray-50 rounded-lg flex items-center justify-between">
                  <div className="flex items-center">
                    <ImageIcon className="w-5 h-5 mr-2 text-[#003366]" />
                    <span className="text-sm text-gray-600">{attachment.name}</span>
                  </div>
                  <button
                    onClick={() => setAttachment(null)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Kaldır
                  </button>
                </div>
              )}
              
              {/* Voice Recognition Status */}
              {isListening && !isVoiceMode && (
                <div className="mb-2 p-2 bg-red-50 rounded-lg flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-red-700">Dinleniyor... Konuşmaya başlayın</span>
                </div>
              )}

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Mesajınızı yazın veya mikrofon butonuna basın..."
                  className="flex-1 p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366] transition-colors"
                  disabled={isLoading}
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  ref={fileInputRef}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="p-3 sm:p-4 text-[#003366] hover:bg-gray-100 rounded-xl transition-colors disabled:text-gray-400 disabled:hover:bg-transparent"
                  title="Resim ekle"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
                
                {/* Manual Voice Recognition Button */}
                {speechRecognitionSupported && (
                  <button
                    onClick={() => {
                      if (isListening) {
                        stopListening();
                      } else {
                        startListening();
                      }
                    }}
                    disabled={isLoading}
                    className={`p-3 sm:p-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      isListening
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'text-[#003366] hover:bg-gray-100'
                    }`}
                    title={isListening ? 'Dinlemeyi durdur' : 'Sesli mesaj'}
                  >
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                )}
                
                <button
                  onClick={handleSendMessage}
                  disabled={isLoading}
                  className="bg-[#003366] hover:bg-[#004080] text-white p-3 sm:p-4 rounded-xl transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center shadow-lg"
                  title="Mesaj gönder"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;