import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, ArrowLeft, MapPin, Loader2, X, Plus, Circle, Heart, Square } from 'lucide-react';
import { db } from './firebase';
import { collection, addDoc, onSnapshot, query, orderBy, limit, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { GoogleGenAI } from '@google/genai';

// --- MOCK API DATA ---
const mockGeminiResponse = (text) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        items: [
          { name: "야근의 피곤함", quantity: 1, price: -50000, type: "negative" },
          { name: "맛있는 저녁 식사", quantity: 1, price: 20000, type: "positive" },
        ],
        total: -30000,
        sympathy_message: "오늘 하루도 정말 고생 많으셨어요. 푹 쉬시고 내일은 더 좋은 일만 가득하길 바라요!",
        ad_copy: "수고한 당신을 위한 시원한 맥주 한 캔 어때요?"
      });
    }, 1500);
  });
};

// --- REAL API LOGIC ---
const getGeminiReceipt = async (text) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("No Gemini API key found, using mock data.");
    return await mockGeminiResponse(text);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `사용자의 하루를 분석하여 영수증 형식의 JSON 데이터를 생성해주세요.
사용자 입력: "${text}"
조건:
1. items 배열에는 name(품목명), quantity(수량), price(가격, 긍정이면 양수, 부정이면 음수), type("positive" 또는 "negative")이 포함되어야 합니다.
2. total은 모든 items의 price 합계입니다.
3. sympathy_message는 입력된 내용을 바탕으로 사용자에게 건네는 따뜻한 공감과 위로의 메시지 1~2줄입니다.
4. ad_copy는 입력 내용에 맞는 1줄짜리 맞춤 광고 문구입니다.
응답은 반드시 JSON 형식으로만 반환하세요.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini API Error:", error);
    return await mockGeminiResponse(text);
  }
};

const getAINeighborReaction = async (text) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return { shape: 'heart', size: 'md', by_nickname: '따뜻한 AI 이웃' };
  }
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `사용자의 영수증 내용("${text}")에 공감하는 이웃의 반응을 만들어주세요.
응답은 JSON 형식으로 반환하세요:
{
  "shape": "circle", // circle, heart, square 중 하나 (기쁨/공감은 heart, 무난함은 circle, 단호/독특함은 square)
  "size": "md", // sm, md, lg 중 하나
  "by_nickname": "따뜻한 AI 이웃" // 내용에 어울리는 짧은 닉네임 (예: 위로봇, 짱구, 동네형)
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    return JSON.parse(response.text);
  } catch (e) {
    return { shape: 'heart', size: 'md', by_nickname: '따뜻한 AI 이웃' };
  }
};

// --- COMPONENTS ---

const BackgroundReceipts = React.memo(({ isLanding }) => {
  const [receipts, setReceipts] = useState([]);

  useEffect(() => {
    // Generate falling receipts periodically
    const interval = setInterval(() => {
      setReceipts(prev => [
        ...prev.slice(-60), // keep max 60
        { id: Date.now(), left: Math.random() * 90, duration: 8 + Math.random() * 8, rotEnd: -30 + Math.random() * 60 }
      ]);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`fixed inset-0 overflow-hidden pointer-events-none z-0 transition-opacity duration-700 ${isLanding ? 'opacity-30' : 'opacity-5'}`}>
      {receipts.map(r => (
        <motion.div
          key={r.id}
          initial={{ y: -200, rotate: -10 + Math.random() * 20 }}
          animate={{ y: window.innerHeight + 200, rotate: r.rotEnd }}
          transition={{ duration: r.duration, ease: "linear" }}
          className="absolute bg-white border border-gray-300 shadow-md w-24 h-36 opacity-70 flex flex-col items-center justify-start p-2 rounded-sm"
          style={{ left: `${r.left}%` }}
        >
          <div className="w-full h-1 bg-gray-300 mt-1 mb-2"></div>
          <div className="w-3/4 h-1 bg-gray-300 mb-1"></div>
          <div className="w-1/2 h-1 bg-gray-300 mb-1"></div>
          <div className="flex-1 w-full flex items-end justify-center">
             <div className="w-12 h-1 bg-gray-300"></div>
          </div>
        </motion.div>
      ))}
    </div>
  );
});

const MapModal = ({ onClose }) => {
  const mapRef = useRef(null);

  useEffect(() => {
    const initMap = () => {
      if (!window.google) return;

      const renderMap = (location, title) => {
        const map = new window.google.maps.Map(mapRef.current, {
          center: location,
          zoom: 14,
          disableDefaultUI: true,
        });

        new window.google.maps.Marker({
          position: location,
          map: map,
          title: title,
        });

        new window.google.maps.Circle({
          strokeColor: "#10b981",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: "#10b981",
          fillOpacity: 0.35,
          map,
          center: location,
          radius: 1000, // 1km 반경
        });
      };

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const userLocation = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            renderMap(userLocation, "현재 내 위치");
          },
          () => {
            // Geolocation failed or denied, fallback to Gungdong
            renderMap({ lat: 36.3622, lng: 127.3500 }, "내 위치 (궁동)");
          }
        );
      } else {
        // Geolocation not supported, fallback to Gungdong
        renderMap({ lat: 36.3622, lng: 127.3500 }, "내 위치 (궁동)");
      }
    };

    if (!window.google) {
      const script = document.createElement("script");
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''; 
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMapPlaceholder`;
      script.async = true;
      script.defer = true;
      window.initMapPlaceholder = initMap;
      document.head.appendChild(script);
    } else {
      initMap();
    }
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative"
      >
        <div className="p-4 bg-emerald-600 text-white flex justify-between items-center">
          <h3 className="font-bold text-lg flex items-center">
            <MapPin className="w-5 h-5 mr-2" />
            현재 위치 및 설정 반경
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-emerald-700 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="w-full h-80 bg-slate-100 relative">
          <div ref={mapRef} className="absolute inset-0"></div>
          {!import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 space-y-2">
              <span className="bg-black/60 text-white text-sm px-3 py-1.5 rounded-full font-bold">지도 API 키가 필요합니다 (.env)</span>
              <span className="bg-emerald-500/80 text-white text-xs px-2 py-1 rounded">궁동 (1km 반경) 가상 표시 중</span>
            </div>
          )}
        </div>
        <div className="p-4 text-center text-slate-600 font-bold bg-emerald-50">
          📍 대전광역시 유성구 궁동 (반경 1km 설정됨)
        </div>
      </motion.div>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState('landing'); // landing, write, feed, detail
  const [inputTexts, setInputTexts] = useState(['']);
  const [isProcessing, setIsProcessing] = useState(false);
  const initialMockData = [
    { id: 'mock1', nickname: "비오는날", raw_text: "오늘 하루 종일 비가 와서 우울했다...", items: [{name: '우울함', quantity:1, price:-15000}], total: -15000, ad_copy: "비오는 날엔 파전이죠!", punch_holes: [], created_at: Date.now() - 3600000 },
    { id: 'mock2', nickname: "햇살가득", raw_text: "오랜만에 친구들 만나서 재밌게 놀았음!", items: [{name: '즐거움', quantity:1, price: 30000}], total: 30000, ad_copy: "즐거운 만남, 시원한 아메리카노 어떠세요?", punch_holes: [], created_at: Date.now() - 7200000 },
    { id: 'mock3', nickname: "야근의요정", raw_text: "오늘도 야근... 언제 집에 가지", items: [{name: '피곤함', quantity:1, price:-50000}], total: -50000, ad_copy: "수고한 당신, 푹신한 베개 하나 장만하세요.", punch_holes: [], created_at: Date.now() - 10800000 },
  ];

  const [feed, setFeed] = useState([]);
  const [selectedFeedItem, setSelectedFeedItem] = useState(null);
  const [showMap, setShowMap] = useState(false);
  
  const [nickname, setNickname] = useState(() => localStorage.getItem('punch_nickname') || '');
  const [tempNickname, setTempNickname] = useState('');
  const isLoggedIn = !!nickname;
  
  // Local state for punching on the detail screen
  const [localPunches, setLocalPunches] = useState([]);
  const [selectedShape, setSelectedShape] = useState('circle');
  const detailReceiptRef = useRef(null);

  const isInitialLoad = useRef(true);

  useEffect(() => {
    fetch('/api/feed')
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          setFeed(data);
        } else {
          setFeed(initialMockData);
        }
        setTimeout(() => { isInitialLoad.current = false; }, 100);
      })
      .catch(() => {
        setFeed(initialMockData);
        setTimeout(() => { isInitialLoad.current = false; }, 100);
      });
  }, []);

  useEffect(() => {
    if (!isInitialLoad.current && feed.length > 0) {
      fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feed)
      }).catch(console.error);
    }
  }, [feed]);

  useEffect(() => {
    if (selectedFeedItem) {
      const updatedItem = feed.find(item => item.id === selectedFeedItem.id);
      if (updatedItem) setSelectedFeedItem(updatedItem);
    }
  }, [feed]);

  const handleLogin = () => {
    if (tempNickname.trim()) {
      setNickname(tempNickname.trim());
      localStorage.setItem('punch_nickname', tempNickname.trim());
    }
  };

  const handleCreateReceipt = async () => {
    const combinedText = inputTexts.filter(t => t.trim() !== '').join('\n');
    if (!combinedText) return;
    setIsProcessing(true);
    
    // 1. Call Gemini to get AI Analysis
    const receiptData = await getGeminiReceipt(combinedText);
    
    const newReceipt = {
      id: Date.now().toString(),
      nickname: nickname,
      district: "궁동",
      raw_text: combinedText,
      items: receiptData.items,
      total: receiptData.total,
      sympathy_message: receiptData.sympathy_message,
      ad_copy: receiptData.ad_copy || receiptData.ad,
      punch_holes: [],
      created_at: Date.now()
    };
    
    setFeed(prev => [newReceipt, ...prev]);
    
    setIsProcessing(false);
    setInputTexts(['']);
    setView('feed'); // Move to community feed

    // Trigger AI Neighbor reaction after 3 seconds
    setTimeout(async () => {
      const reaction = await getAINeighborReaction(combinedText);
      const isLeft = Math.random() > 0.5;
      const x = isLeft ? 5 + Math.random() * 15 : 80 + Math.random() * 15;
      const y = 20 + Math.random() * 60;
      
      const newPunch = { 
        id: Date.now(), 
        x, 
        y, 
        shape: reaction.shape || 'circle', 
        size: reaction.size || 'md', 
        by_nickname: reaction.by_nickname || 'AI 이웃' 
      };

      setFeed(currentFeed => currentFeed.map(item => {
        if (item.id === newReceipt.id) {
          return { ...item, punch_holes: [...(item.punch_holes || []), newPunch] };
        }
        return item;
      }));
    }, 3000);
  };

  const handlePunch = async (e) => {
    if (!detailReceiptRef.current || !selectedFeedItem || selectedFeedItem.nickname === nickname) return;
    const rect = detailReceiptRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Only allow punching on the side margins (e.g. x < 25% or x > 75%)
    if (x > 25 && x < 75) return;

    const shape = selectedShape;
    
    const sizes = ['sm', 'md', 'lg'];
    const size = sizes[Math.floor(Math.random() * sizes.length)];
    
    const newPunch = { id: Date.now(), x, y, shape, size, by_nickname: nickname };
    
    // Optimistic UI update
    setLocalPunches(prev => [...prev, newPunch]);

    // Update local feed
    setFeed(prev => prev.map(item => {
      if (item.id === selectedFeedItem.id) {
        return { ...item, punch_holes: [...(item.punch_holes || []), newPunch] };
      }
      return item;
    }));
  };

  return (
    <div className={`min-h-screen relative overflow-hidden font-pixel transition-colors duration-700 ${view === 'landing' ? 'bg-[#0f172a] text-slate-200' : 'bg-transparent text-slate-800'}`}>
      <BackgroundReceipts isLanding={view === 'landing'} />

      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4 max-w-md mx-auto">
        <AnimatePresence mode="wait">
          
          {/* 1. LANDING SCREEN */}
          {view === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full flex flex-col items-center justify-center min-h-[60vh] space-y-12"
            >
              <div className="text-center space-y-6">
                <h1 className="text-6xl font-bold tracking-widest text-[#f8f4e6] drop-shadow-[0_0_20px_rgba(248,244,230,0.4)] leading-tight">
                  PUNCH<br/>HOLE
                </h1>
                <p className="text-xl text-slate-300 font-bold drop-shadow-sm">오늘 하루, 딱 한 줄로 결제해드릴게요.</p>
              </div>

              {/* Login / Start Flow */}
              {!isLoggedIn ? (
                <div className="w-full flex flex-col items-center space-y-4">
                  <input 
                    type="text" 
                    value={tempNickname} 
                    onChange={e => setTempNickname(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    placeholder="사용하실 닉네임을 입력해주세요"
                    className="w-full p-4 rounded-xl text-lg text-center font-bold text-white bg-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500 transition-all border-2 border-transparent placeholder-gray-400 shadow-inner"
                  />
                  <button
                    onClick={handleLogin}
                    disabled={!tempNickname.trim()}
                    className="w-full py-5 bg-indigo-600 text-white text-2xl font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-xl active:scale-95 disabled:opacity-50"
                  >
                    시작하기
                  </button>
                </div>
              ) : (
                <div className="w-full flex flex-col space-y-4">
                  <div className="text-center text-lg text-slate-300 mb-2">
                    환영합니다, <span className="font-bold text-white text-xl">{nickname}</span>님!
                  </div>
                  <button
                    onClick={() => setView('write')}
                    className="w-full py-5 bg-white text-[#1f2937] text-2xl font-bold rounded-xl hover:bg-[#f8f4e6] transition-all shadow-[0_0_20px_rgba(248,244,230,0.2)] active:scale-95"
                  >
                    펀치홀 결제하기
                  </button>
                  <button 
                    onClick={() => { setNickname(''); setTempNickname(''); localStorage.removeItem('punch_nickname'); }}
                    className="text-slate-500 text-sm hover:text-white underline mt-2 transition-colors"
                  >
                    다른 닉네임으로 시작하기
                  </button>
                </div>
              )}
              
              <button 
                onClick={() => setView('feed')}
                className="text-slate-400 hover:text-white underline underline-offset-4 mt-8 font-bold transition-colors"
              >
                이웃들의 영수증 바로보기
              </button>
            </motion.div>
          )}

          {/* 2. WRITE RECEIPT SCREEN */}
          {view === 'write' && (
            <motion.div
              key="write"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full flex flex-col items-center"
            >
              <div className="w-full flex justify-start mb-4">
                <button onClick={() => { setInputTexts(['']); setView('landing'); }} className="text-slate-500 hover:text-slate-800 flex items-center bg-white border border-slate-300 shadow-sm px-4 py-2 rounded-full font-bold">
                  <ArrowLeft className="w-5 h-5 mr-2" /> 뒤로 가기
                </button>
              </div>
              <div className="w-full bg-[#f8f4e6] text-[#1f2937] p-8 receipt-edge receipt-edge-top noise-bg shadow-2xl relative px-12 sm:px-16">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold mb-1">"{nickname}"의 감정 영수증</h2>
                  <p className="text-sm text-gray-500">{new Date().toLocaleString()}</p>
                </div>

                <div className="receipt-text-divider"></div>

                <div className="space-y-3 my-6 w-full">
                  {inputTexts.map((text, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={text}
                        onChange={(e) => {
                          const newTexts = [...inputTexts];
                          newTexts[idx] = e.target.value;
                          setInputTexts(newTexts);
                        }}
                        placeholder="오늘 하루 어땠나요? 한 줄을 남겨주세요."
                        className="flex-1 bg-slate-800 border-2 border-transparent p-4 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 transition-all text-lg font-bold shadow-inner"
                        disabled={isProcessing}
                      />
                      {inputTexts.length > 1 && (
                        <button
                          onClick={() => {
                            const newTexts = inputTexts.filter((_, i) => i !== idx);
                            setInputTexts(newTexts);
                          }}
                          disabled={isProcessing}
                          className="p-4 bg-rose-100 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-colors flex-shrink-0 shadow-sm"
                        >
                          <X className="w-6 h-6" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button 
                    onClick={() => setInputTexts([...inputTexts, ''])}
                    disabled={isProcessing}
                    className="w-full py-2 mt-2 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-200/50 rounded-lg transition-colors border-2 border-dashed border-transparent hover:border-gray-400"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </div>

                <div className="receipt-text-divider"></div>

                <div className="text-center text-sm text-gray-500 mt-6 bg-gray-200/50 p-3 rounded">
                  내용을 추가하면 AI가 맞춤형 영수증과 문구를 생성합니다.
                </div>

                {/* Removed bottom cancel/share buttons */}
                <button
                  onClick={handleCreateReceipt}
                  disabled={isProcessing || !inputTexts.some(t => t.trim() !== '')}
                  className="w-full mt-3 py-4 bg-indigo-600 text-white text-lg rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center font-bold shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" /> 분석 및 생성 중...
                    </>
                  ) : (
                    "영수증 발급"
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* 3. COMMUNITY FEED SCREEN */}
          {view === 'feed' && (
            <motion.div
              key="feed"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <button onClick={() => setView('landing')} className="text-slate-500 hover:text-slate-800 bg-white border border-slate-300 p-2 rounded-full shadow-sm">
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex items-center bg-white px-5 py-3 rounded-full border border-slate-300 shadow-sm">
                  <MapPin className="w-5 h-5 text-emerald-600 mr-2" />
                  <span className="font-bold text-emerald-800 text-lg">
                    <button onClick={() => setShowMap(true)} className="underline decoration-emerald-500 underline-offset-4 hover:text-emerald-600 transition-colors">궁동</button> 이웃들의 영수증
                  </span>
                </div>
                <div className="w-10"></div> {/* Spacer */}
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-5 pb-10">
                {feed.map(item => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={item.id} 
                    className="bg-white/90 border border-slate-200 p-5 rounded-2xl shadow-md cursor-pointer hover:bg-white hover:shadow-lg hover:scale-[1.02] transition-all"
                    onClick={() => {
                      setSelectedFeedItem(item);
                      setLocalPunches([]); // reset local optimistic punches
                      setView('detail');
                    }}
                  >
                    <div className="flex justify-between items-center mb-3 text-sm text-slate-500 border-b border-slate-200 pb-2">
                      <span className={`font-bold ${item.nickname === nickname ? 'text-rose-500' : 'text-indigo-600'}`}>
                        {item.nickname === nickname ? `${item.nickname} (나)` : (item.nickname || "익명")}
                      </span>
                      <span>{new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p className="text-slate-800 mb-4 leading-relaxed text-lg break-words">"{item.raw_text}"</p>
                    <div className="flex justify-between items-center text-base">
                      <span className={`font-bold ${item.total > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {item.total > 0 ? '+' : ''}{item.total?.toLocaleString()} ⓟ
                      </span>
                      <div className="flex items-center space-x-2 bg-slate-100 px-4 py-1.5 rounded-full text-slate-600 shadow-inner border border-slate-200">
                        <div className="w-3.5 h-3.5 rounded-full bg-slate-400"></div>
                        <span className="font-bold">x {item.punch_holes?.length || 0}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* 4. DETAIL SCREEN (Neighbor's Receipt with AI Result & Punching) */}
          {view === 'detail' && selectedFeedItem && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full flex flex-col items-center pb-10"
            >
              <div className="w-full flex justify-start mb-4">
                <button onClick={() => setView('feed')} className="text-slate-500 hover:text-slate-800 flex items-center bg-white border border-slate-300 shadow-sm px-4 py-2 rounded-full font-bold">
                  <ArrowLeft className="w-5 h-5 mr-2" /> 피드로 돌아가기
                </button>
              </div>

              {/* Shape Selector (Left Side Fixed) */}
              {selectedFeedItem.nickname !== nickname && (
                <div className="fixed left-2 sm:left-6 top-1/2 -translate-y-1/2 flex flex-col space-y-3 z-50">
                  {[
                    { id: 'circle', icon: Circle, label: "동그라미" },
                    { id: 'heart', icon: Heart, label: "하트" },
                    { id: 'square', icon: Square, label: "네모" },
                  ].map(s => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedShape(s.id)}
                        className={`p-3 rounded-full shadow-lg transition-all ${selectedShape === s.id ? 'bg-indigo-600 text-white scale-110' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}
                        title={s.label}
                      >
                        <Icon className="w-6 h-6 sm:w-8 sm:h-8" />
                      </button>
                    );
                  })}
                </div>
              )}
              
              {/* Receipt Area */}
              <div 
                ref={detailReceiptRef}
                onClick={handlePunch}
                className="w-full bg-[#f8f4e6] text-[#1f2937] py-8 px-12 sm:px-16 receipt-edge receipt-edge-top noise-bg shadow-2xl relative cursor-crosshair transform transition-transform min-h-[500px] flex flex-col"
              >
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold mb-1">"{selectedFeedItem.nickname || '닉네임'}"의 감정 영수증</h2>
                  <p className="text-sm text-gray-500">{new Date(selectedFeedItem.created_at).toLocaleString()}</p>
                </div>

                <div className="receipt-text-divider"></div>

                {/* User's Original Text */}
                <div className="text-lg text-gray-800 mb-4 font-bold break-words whitespace-pre-wrap leading-relaxed">
                  "{selectedFeedItem.raw_text}"
                </div>
                
                {/* AI Generated Items */}
                <div className="space-y-4 my-2 flex-1">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-400">
                        <th className="pb-2 font-normal">품목</th>
                        <th className="pb-2 font-normal text-right">수량</th>
                        <th className="pb-2 font-normal text-right">단가</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedFeedItem.items?.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-3 pr-2 border-b border-dashed border-gray-300">{item.name}</td>
                          <td className="py-3 text-right border-b border-dashed border-gray-300">{item.quantity || item.qty || 1}</td>
                          <td className={`py-3 text-right border-b border-dashed border-gray-300 font-bold ${item.price > 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {item.price > 0 ? '+' : ''}{item.price.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="receipt-text-divider"></div>

                <div className="flex justify-between items-center text-2xl font-bold my-2">
                  <span>합계</span>
                  <span className={selectedFeedItem.total > 0 ? 'text-green-700' : 'text-red-700'}>
                    {selectedFeedItem.total > 0 ? '+' : ''}{selectedFeedItem.total?.toLocaleString()} ⓟ
                  </span>
                </div>

                <div className="receipt-text-divider"></div>

                {selectedFeedItem.sympathy_message && (
                  <div className="text-center text-lg text-emerald-700 font-bold mt-6 mb-2 bg-emerald-50 p-4 rounded-xl border border-emerald-200 shadow-sm leading-relaxed break-words whitespace-pre-wrap">
                    "{selectedFeedItem.sympathy_message}"
                  </div>
                )}

                {/* AI Generated Ad Copy */}
                <div className="text-center text-sm text-gray-700 mt-4 bg-gray-200/60 p-4 rounded-lg border border-gray-300 shadow-inner">
                  <p className="font-bold mb-2 text-indigo-800">[맞춤 광고]</p>
                  <p className="text-base">"{selectedFeedItem.ad_copy || selectedFeedItem.ad}"</p>
                </div>
                
                {/* Interactive Hint & Share Button */}
                {selectedFeedItem.nickname === nickname ? (
                  <div className="mt-8 flex flex-col items-center space-y-4 z-50">
                    <div className="text-center text-sm font-bold text-rose-500/80">
                      내 영수증에는 공감(펀치홀)을 남길 수 없습니다.
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (navigator.share) {
                          try {
                            await navigator.share({
                              title: '나의 감정 영수증',
                              text: `제 감정 영수증 보실래요?\n\n"${selectedFeedItem.raw_text}"\n합계: ${selectedFeedItem.total}ⓟ`,
                              url: window.location.href,
                            });
                          } catch (error) {
                            console.log('Error sharing', error);
                          }
                        } else {
                          alert('이 브라우저에서는 공유 기능이 지원되지 않습니다.');
                        }
                      }}
                      className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition-transform active:scale-95 cursor-pointer"
                    >
                      <Share2 className="w-5 h-5 mr-2" />
                      SNS에 공유하기
                    </button>
                  </div>
                ) : (
                  <div className="mt-8 text-center text-sm font-bold text-indigo-600/80 animate-pulse">
                    양쪽 빈 공간(사이드)을 클릭해 펀치홀을 뚫어보세요!
                  </div>
                )}

                {/* Punches (Merged remote & local optimistic) */}
                {[...(selectedFeedItem.punch_holes || []), ...localPunches].map((p, idx) => {
                  if(!p.x) return null; // Handle mock empty objects
                  const sizeClass = p.size === 'lg' ? 'scale-150' : p.size === 'sm' ? 'scale-75' : 'scale-100';
                  
                  return (
                    <div
                      key={p.id || idx}
                      className={`punch-hole ${p.shape || 'circle'} ${sizeClass} z-50`}
                      style={{ left: `${p.x}%`, top: `${p.y}%` }}
                    >
                      <span className="opacity-0 hover:opacity-100 absolute -top-10 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-sm px-3 py-1.5 rounded-lg whitespace-nowrap transition-opacity pointer-events-auto shadow-xl font-bold">
                        {p.by_nickname}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Map Modal */}
      <AnimatePresence>
        {showMap && <MapModal onClose={() => setShowMap(false)} />}
      </AnimatePresence>
    </div>
  );
}
