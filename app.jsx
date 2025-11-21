import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, query, orderBy, where, getDocs, runTransaction, serverTimestamp, getDoc, setLogLevel } from 'firebase/firestore';

// --- CONFIGURATION ---
const HOST_AUTH_CODE = "CEREBREXIA2025";
const TEAM_AUTH_CODE = "CEREBREXIA25";
const QUESTION_DURATION_SECONDS = 60;
const TOTAL_QUESTIONS = 10; // Total number of questions in the screening round

// Predefined questions are removed, Host must input them.

// --- FIREBASE SETUP ---
// Using user-provided Firebase configuration data for initialization.

// Hardcoded Firebase Config (used as a fallback or in environments where global variable isn't injected)
const HARDCODED_FIREBASE_CONFIG = {
  apiKey: "AIzaSyC8FW-D3XFjjbNi2AtmkuAbOmpH6mRXNjM",
  authDomain: "cerebrexia-quiz.firebaseapp.com",
  projectId: "cerebrexia-quiz",
  storageBucket: "cerebrexia-quiz.firebasestorage.app",
  messagingSenderId: "348160751988",
  appId: "1:348160751988:web:78b94d52d996cb79ffd421"
};

// Check if the Canvas environment variable is available. If not, use the hardcoded one.
const firebaseConfig = (() => {
    try {
        const injectedConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
        return Object.keys(injectedConfig).length > 0 ? injectedConfig : HARDCODED_FIREBASE_CONFIG;
    } catch (e) {
        console.error("Error parsing __firebase_config, falling back to hardcoded config.", e);
        return HARDCODED_FIREBASE_CONFIG;
    }
})();

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

const useFirebase = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    try {
      if (Object.keys(firebaseConfig).length === 0) {
        console.error("Firebase config is empty. Cannot initialize.");
        return;
      }
      setLogLevel('debug'); // Enable Firestore logging for debugging
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      const PUBLIC_PATH = `artifacts/${appId}/public/data`;
      const docRef = doc(firestore, PUBLIC_PATH, 'game-state', 'master');

      // 1. Check if the master game state document exists, if not, create it in 'lobby' state
      const initializeGameState = async () => {
        try {
          const docSnap = await getDoc(docRef);
          if (!docSnap.exists()) {
            await setDoc(docRef, {
              status: 'lobby', // 'lobby' | 'question' | 'results'
              currentQuestionIndex: -1, // -1 for lobby, 0-indexed for questions (Q1 is index 0)
              questionStartTime: 0,
              currentQuestionText: 'Awaiting Host Start',
              correctAnswer: '',
              lastUpdate: serverTimestamp()
            });
            console.log("Initial game state created.");
          }
        } catch (error) {
          console.error("Error initializing game state:", error);
        }
      };

      // 2. Handle Authentication
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
          console.log("User authenticated:", user.uid);
          await initializeGameState(); // Initialize game state after auth
        } else {
          // Sign in using custom token or anonymously
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (error) {
            console.error("Authentication failed:", error);
            // Fallback for non-auth ready state
            setUserId(crypto.randomUUID());
            setIsAuthReady(true);
            await initializeGameState();
          }
        }
      });

      return () => unsubscribe();
    } catch (e) {
      console.error("Firebase Initialization Error:", e);
    }
  }, []);

  const PUBLIC_PATH = `artifacts/${appId}/public/data`;
  const GAME_STATE_DOC_REF = db ? doc(db, PUBLIC_PATH, 'game-state', 'master') : null;
  const TEAMS_COLLECTION_REF = db ? collection(db, PUBLIC_PATH, 'teams') : null;
  const SUBMISSIONS_COLLECTION_REF = db ? collection(db, PUBLIC_PATH, 'submissions') : null;

  return { db, auth, userId, isAuthReady, GAME_STATE_DOC_REF, TEAMS_COLLECTION_REF, SUBMISSIONS_COLLECTION_REF };
};

// --- UTILITY COMPONENTS ---

const LoadingSpinner = () => (
  <div className="flex flex-col items-center justify-center p-8 min-h-screen bg-[#E0F2F1]">
    <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-4 border-[#FF6B6B] border-opacity-75"></div>
    <p className="mt-4 text-[#263238] text-lg font-bold">Connecting to Med-Melody...</p>
  </div>
);

const MessageBox = ({ title, message, icon }) => (
  <div className="bg-white/90 p-6 rounded-xl shadow-lg border-2 border-[#FFC107] max-w-sm mx-auto backdrop-blur-sm">
    <div className="flex items-center space-x-4">
      {icon}
      <div>
        <h3 className="text-xl font-bold text-[#FF6B6B]">{title}</h3>
        <p className="text-[#455A64] mt-1">{message}</p>
      </div>
    </div>
  </div>
);

// --- DESIGN ELEMENTS ---
const LogoBanner = () => (
  <div className="absolute top-0 left-0 right-0 p-4 bg-[#673AB7] text-white text-center text-4xl font-bold font-['Arial'] tracking-wider">
    CEREBREXIA '25
  </div>
);

const HeartBeatAnimation = () => (
  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0">
    <svg className="w-96 h-96 opacity-10 animate-pulse" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#E91E63"/>
    </svg>
  </div>
);

const MedMelodyLogo = () => (
  <div className="text-center my-6">
    <h2 className="text-5xl font-['Brush Script MT'] text-[#E91E63] drop-shadow-lg">MedMelody</h2>
    <p className="text-2xl font-['Georgia'] text-[#4CAF50] drop-shadow">Song Se Syndrome</p>
  </div>
);

// --- HOST SCREEN ---

const HostScreen = ({ userId, db, GAME_STATE_DOC_REF, TEAMS_COLLECTION_REF, SUBMISSIONS_COLLECTION_REF }) => {
  const [gameState, setGameState] = useState(null);
  const [teams, setTeams] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [timer, setTimer] = useState(QUESTION_DURATION_SECONDS);
  
  // New states for dynamic question entry
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newCorrectAnswer, setNewCorrectAnswer] = useState('');

  // Real-time listener for Game State
  useEffect(() => {
    if (!GAME_STATE_DOC_REF) return;
    const unsubscribe = onSnapshot(GAME_STATE_DOC_REF, (docSnap) => {
      if (docSnap.exists()) {
        const state = docSnap.data();
        setGameState(state);
        
        // Reset inputs when moving to a new state (e.g., from question back to lobby)
        if (state.status === 'lobby') {
          setNewQuestionText(`Song ${state.currentQuestionIndex + 2} Diagnosis?`);
          setNewCorrectAnswer('');
        }
      } else {
        console.error("Game state document not found.");
      }
    });
    return () => unsubscribe();
  }, [GAME_STATE_DOC_REF]);

  // Real-time listener for Teams
  useEffect(() => {
    if (!TEAMS_COLLECTION_REF) return;
    const unsubscribe = onSnapshot(TEAMS_COLLECTION_REF, (snapshot) => {
      setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [TEAMS_COLLECTION_REF]);

  // Real-time listener for Submissions for the current question
  useEffect(() => {
    if (!SUBMISSIONS_COLLECTION_REF || !gameState || gameState.currentQuestionIndex === -1) return;
    
    // FIX: Removed orderBy('timestamp', 'asc') to avoid Firebase index requirement.
    const q = query(
      SUBMISSIONS_COLLECTION_REF,
      where('questionIndex', '==', gameState.currentQuestionIndex)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [SUBMISSIONS_COLLECTION_REF, gameState]);

  // Timer logic
  useEffect(() => {
    if (!gameState || gameState.status !== 'question' || !gameState.questionStartTime) {
      setTimer(QUESTION_DURATION_SECONDS);
      return;
    }

    const startTimestamp = gameState.questionStartTime.toMillis ? gameState.questionStartTime.toMillis() : gameState.questionStartTime;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimestamp;
      const remaining = QUESTION_DURATION_SECONDS - (elapsed / 1000);
      setTimer(Math.max(0, remaining));

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [gameState]);

  const startNextQuestion = useCallback(async () => {
    if (!GAME_STATE_DOC_REF) return;

    const nextIndex = (gameState?.currentQuestionIndex || -1) + 1;

    if (nextIndex >= TOTAL_QUESTIONS) {
      // All questions done
      try {
        await setDoc(GAME_STATE_DOC_REF, {
          status: 'results', // Indicate all questions are done, show final results
          currentQuestionIndex: nextIndex,
          questionStartTime: 0,
          currentQuestionText: 'Screening Round Complete!',
          correctAnswer: '',
          lastUpdate: serverTimestamp()
        }, { merge: true });
        console.log("All screening questions completed.");
      } catch (e) {
        console.error("Error setting game to results state:", e);
      }
      return;
    }
    
    // Use the host-entered data
    const questionText = newQuestionText.trim() || `Song ${nextIndex + 1} Diagnosis?`;
    const correctAnswer = newCorrectAnswer.trim();
    
    if (!correctAnswer) {
        window.confirm("Please enter the correct answer before starting the next question.");
        return;
    }

    try {
      await setDoc(GAME_STATE_DOC_REF, {
        status: 'question',
        currentQuestionIndex: nextIndex,
        questionStartTime: Date.now(), // Use local time for start sync
        currentQuestionText: questionText,
        correctAnswer: correctAnswer,
        lastUpdate: serverTimestamp()
      });
      console.log(`Question ${nextIndex + 1} started.`);

      // Prepare fields for the subsequent question
      setNewQuestionText(`Song ${nextIndex + 2} Diagnosis?`);
      setNewCorrectAnswer('');
      
    } catch (e) {
      console.error("Error starting question:", e);
    }
  }, [GAME_STATE_DOC_REF, gameState, newQuestionText, newCorrectAnswer]);

  const resetGame = useCallback(async () => {
    if (!GAME_STATE_DOC_REF || !SUBMISSIONS_COLLECTION_REF || !TEAMS_COLLECTION_REF) return;

    if (!window.confirm("Are you sure you want to reset the entire game (including all teams and submissions)?")) return;

    try {
      // 1. Reset Game State
      await setDoc(GAME_STATE_DOC_REF, {
        status: 'lobby',
        currentQuestionIndex: -1,
        questionStartTime: 0,
        currentQuestionText: 'Awaiting Host Start',
        correctAnswer: '',
        lastUpdate: serverTimestamp()
      });

      // 2. Clear all submissions
      const qSubmissions = query(SUBMISSIONS_COLLECTION_REF);
      const snapshotSubmissions = await getDocs(qSubmissions);
      const batchSubmissions = db.batch();
      snapshotSubmissions.docs.forEach((doc) => batchSubmissions.delete(doc.ref));
      await batchSubmissions.commit();

      // 3. Clear all teams
      const qTeams = query(TEAMS_COLLECTION_REF);
      const snapshotTeams = await getDocs(qTeams);
      const batchTeams = db.batch();
      snapshotTeams.docs.forEach((doc) => batchTeams.delete(doc.ref));
      await batchTeams.commit();

      console.log("Game reset completed.");
    } catch (e) {
      console.error("Error resetting game:", e);
    }
  }, [GAME_STATE_DOC_REF, SUBMISSIONS_COLLECTION_REF, TEAMS_COLLECTION_REF, db]);

  const currentQuestionIndex = gameState?.currentQuestionIndex || -1;
  const isQuestionActive = gameState?.status === 'question' && timer > 0;
  const isQuestionOver = gameState?.status === 'question' && timer <= 0;
  const isScreeningComplete = gameState?.status === 'results' && currentQuestionIndex === TOTAL_QUESTIONS;
  
  const displayTimer = Math.floor(timer * 10) / 10;

  // Function to determine if an answer was correct for a specific question (index)
  // This is used ONLY for rendering the current scoreboard accurately.
  const isSubmissionCorrect = useCallback((sub) => {
    if (!sub || !gameState || gameState.currentQuestionIndex === -1) return false;
    
    // We compare the submission answer against the correct answer stored in the live gameState
    return sub.answer?.toLowerCase().trim() === gameState.correctAnswer?.toLowerCase().trim();
  }, [gameState]);


  // Calculate scores (for the current question only)
  const scoreBoard = useMemo(() => {
    const scores = teams.map(t => ({
      id: t.id,
      name: t.teamName,
      submissions: {}, // Stores submission objects {answer, isCorrect, timeTakenMs}
    }));
    
    // Process submissions
    submissions.forEach(sub => {
      const teamEntry = scores.find(s => s.id === sub.teamId);
      if (teamEntry) {
        // Correctness check uses the helper function which relies on live gameState
        const isCorrect = isSubmissionCorrect(sub);
        
        teamEntry.submissions[sub.questionIndex] = {
          answer: sub.answer,
          isCorrect: isCorrect,
          timeTakenMs: sub.timeTakenMs,
        };
      }
    });

    // Sorting: prioritize teams who submitted for the current question, then by time.
    return scores.sort((a, b) => {
      const subA = a.submissions[currentQuestionIndex];
      const subB = b.submissions[currentQuestionIndex];
      
      const statusA = subA ? (subA.isCorrect ? 2 : 1) : 0; // 2=Correct, 1=Incorrect, 0=None
      const statusB = subB ? (subB.isCorrect ? 2 : 1) : 0;

      // Primary sort: Correctness/Submission status (Correct > Incorrect > None)
      if (statusB !== statusA) {
        return statusB - statusA;
      }
      
      // Secondary sort: by submission time for current question (faster is better)
      // We also sort by the submission timestamp itself to maintain order of arrival for non-current submissions
      if (subA && subB && statusA === statusB && statusA > 0) { // Only sort by time if both submitted
        return subA.timeTakenMs - subB.timeTakenMs;
      }
      
      // Tertiary sort: by team name
      return a.name.localeCompare(b.name);
    });
  }, [teams, submissions, currentQuestionIndex, isSubmissionCorrect]);


  const formatTime = (ms) => {
    if (ms === 0) return "00:00.000";
    const seconds = Math.floor(ms / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    const msRemainder = ms % 1000;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${msRemainder.toString().padStart(3, '0')}`;
  };
  
  const questionHeader = gameState?.currentQuestionText.split(':')[0] || 'Screening Round';
  const questionDetails = gameState?.currentQuestionText.split(':').slice(1).join(':').trim();

  if (!gameState) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-[#E0F2F1] text-[#263238] font-['Roboto'] relative overflow-hidden">
      <img src="https://example.com/your-medmelody-banner.png" alt="Med Melody Banner" className="w-full h-auto object-cover absolute top-0 left-0" style={{maxHeight: '200px'}} /> {/* Placeholder image */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#E0F2F1] to-[#BBDEFB] opacity-80 z-0"></div>
      <HeartBeatAnimation />
      <div className="relative z-10 p-4 sm:p-8 pt-24"> 

        <header className="flex justify-between items-center mb-6 pb-4 border-b-2 border-[#FF6B6B]">
          <h1 className="text-3xl font-extrabold text-[#E91E63] flex items-center font-['Montserrat']">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-3 text-[#4CAF50]"><path d="M12 2l3.086 5.874 6.444.935-4.665 4.544 1.102 6.425L12 18.27l-5.967 3.148 1.102-6.425-4.665-4.544 6.444-.935L12 2z" /></svg>
            Cerebrexia '25 - Host Control
          </h1>
          <div className="text-lg font-mono text-[#4CAF50] bg-white/70 px-4 py-2 rounded-lg shadow-md">
            Teams: <span className="text-[#E91E63] font-bold">{teams.length}</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Game Status & Controls */}
          <div className="lg:col-span-1 p-6 bg-white/90 rounded-xl shadow-2xl h-fit sticky top-4 border-l-4 border-[#FFC107] backdrop-blur-sm">
            <h2 className="text-2xl font-bold mb-4 pb-2 border-b border-[#FF6B6B] text-[#E91E63] font-['Open Sans']">Game Status</h2>

            <div className="space-y-4 mb-6 text-[#263238]">
              <p className="text-xl">
                Status: <span className={`font-bold uppercase ${gameState.status === 'lobby' ? 'text-yellow-700' : gameState.status === 'question' ? 'text-[#4CAF50]' : 'text-purple-700'}`}>{gameState.status}</span>
              </p>
              <p className="text-xl">
                Question: <span className="font-bold text-[#E91E63]">{currentQuestionIndex + 1} / {TOTAL_QUESTIONS}</span>
              </p>
              {(isQuestionActive || isQuestionOver || isScreeningComplete) && (
                <>
                  <p className="text-lg">
                    Current Question: <span className="font-semibold text-[#263238]">{gameState.currentQuestionText}</span>
                  </p>
                  {(isQuestionOver || isScreeningComplete || gameState.status === 'results') && gameState.currentQuestionIndex !== -1 && (
                    <p className="text-lg break-words">
                      Correct Answer: <span className="font-semibold text-[#FF6B6B]">{gameState.correctAnswer}</span>
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="text-center bg-[#BBDEFB]/50 p-4 rounded-lg mb-6 border border-[#2196F3]">
              <p className="text-5xl font-mono font-extrabold" style={{ color: timer <= 10 && gameState.status === 'question' ? '#E91E63' : '#4CAF50' }}>
                {displayTimer.toFixed(1)}
              </p>
              <p className="text-base text-[#4CAF50] font-semibold">Remaining Time</p>
            </div>
            
            {/* Host Input for Next Question */}
            {!isScreeningComplete && gameState?.status !== 'question' && currentQuestionIndex < TOTAL_QUESTIONS && (
                <div className="mb-6 space-y-3">
                    <h3 className="text-lg font-bold text-[#673AB7]">Set Next Question ({currentQuestionIndex + 2})</h3>
                    <input
                        type="text"
                        placeholder={`e.g., Song ${currentQuestionIndex + 2} Diagnosis?`}
                        value={newQuestionText}
                        onChange={(e) => setNewQuestionText(e.target.value)}
                        className="w-full p-2 rounded-md bg-[#ECEFF1] border border-[#B0BEC5] text-[#263238] placeholder-[#90A4AE]"
                    />
                    <input
                        type="text"
                        placeholder="Correct Answer (Mandatory)"
                        value={newCorrectAnswer}
                        onChange={(e) => setNewCorrectAnswer(e.target.value)}
                        className="w-full p-2 rounded-md bg-[#ECEFF1] border border-[#B0BEC5] text-[#263238] placeholder-[#90A4AE]"
                    />
                </div>
            )}

            <div className="flex flex-col space-y-3">
              {currentQuestionIndex < TOTAL_QUESTIONS ? (
                <button
                  onClick={startNextQuestion}
                  disabled={isQuestionActive && timer > 0 || (gameState?.status !== 'question' && !newCorrectAnswer.trim())}
                  className={`w-full py-3 rounded-lg text-lg font-bold transition-all duration-200 ${isQuestionActive && timer > 0 || (gameState?.status !== 'question' && !newCorrectAnswer.trim())
                    ? 'bg-[#B0BEC5] text-[#455A64] cursor-not-allowed'
                    : 'bg-[#4CAF50] hover:bg-[#388E3C] active:bg-[#2E7D32] text-white shadow-md hover:shadow-[#4CAF50]/50'
                    }`}
                >
                  {gameState.status === 'lobby' ? 'Start Screening Round' :
                   isQuestionActive ? `Question ${currentQuestionIndex + 1} Active` : `Start Q${currentQuestionIndex + 2} / ${TOTAL_QUESTIONS}`}
                </button>
              ) : (
                <button
                  disabled
                  className="w-full py-3 rounded-lg text-lg font-bold bg-[#673AB7]/50 text-white cursor-not-allowed shadow-md"
                >
                  Screening Complete!
                </button>
              )}
              <button
                onClick={resetGame}
                className="w-full py-2 bg-[#F44336] hover:bg-[#D32F2F] active:bg-[#C62828] text-white rounded-lg text-sm font-semibold transition-all duration-200 shadow-md hover:shadow-[#F44336]/50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
                Reset All Data
              </button>
            </div>
          </div>

          {/* Real-time Scoreboard */}
          <div className="lg:col-span-2 p-6 bg-white/90 rounded-xl shadow-2xl border-r-4 border-[#2196F3] backdrop-blur-sm">
            <h2 className="2xl font-bold mb-4 pb-2 border-b border-[#FF6B6B] text-[#E91E63] font-['Open Sans']">Live Submissions for Q{currentQuestionIndex + 1}</h2>
            <p className="text-sm text-gray-500 mb-4">Note: Due to dynamic questions, submissions are sorted by correctness and speed for the current question only.</p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#BDBDBD]">
                <thead className="bg-[#CFD8DC]">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#455A64] uppercase tracking-wider rounded-tl-lg">Team Name</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-[#455A64] uppercase tracking-wider">Status</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-[#455A64] uppercase tracking-wider">Submission Time</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#455A64] uppercase tracking-wider rounded-tr-lg">Diagnosis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E0E0E0]">
                  {scoreBoard.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-4 text-[#757575]">No teams connected yet or no submissions for current question.</td>
                    </tr>
                  ) : (
                    scoreBoard.map((team) => {
                      const sub = team.submissions[currentQuestionIndex];
                      if (!sub) {
                        return (
                          <tr key={team.id} className="hover:bg-[#ECEFF1]">
                            <td className="px-3 py-3 whitespace-nowrap text-[#4CAF50] font-semibold">{team.name}</td>
                            <td className="px-3 py-3 text-center text-[#9E9E9E]">Waiting...</td>
                            <td className="px-3 py-3 text-center text-[#9E9E9E]">--</td>
                            <td className="px-3 py-3 text-[#9E9E9E]">--</td>
                          </tr>
                        );
                      }
                      
                      const bgColor = isQuestionOver ? (sub.isCorrect ? 'bg-[#A8E6CF]' : 'bg-[#FFADAD]') : 'bg-[#B2EBF2]';
                      const textColor = isQuestionOver ? (sub.isCorrect ? 'text-[#388E3C]' : 'text-[#D32F2F]') : 'text-[#00BCD4]';
                      
                      return (
                        <tr key={team.id} className="hover:bg-[#ECEFF1]">
                          <td className="px-3 py-3 whitespace-nowrap text-[#4CAF50] font-semibold">{team.name}</td>
                          <td className="px-3 py-3 text-center">
                            <div className={`${bgColor} rounded-md p-1 font-mono transition-all duration-300`}>
                              <span className={`block text-xl ${textColor}`}>
                                {isQuestionOver ? (sub.isCorrect ? '✓' : '✗') : 'Submitted'}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center text-sm font-mono text-[#607D8B]">{formatTime(sub.timeTakenMs)}</td>
                          <td className="px-3 py-3 text-[#263238] font-medium">{sub.answer}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- TEAM SCREEN ---

const TeamScreen = ({ userId, db, GAME_STATE_DOC_REF, TEAMS_COLLECTION_REF, SUBMISSIONS_COLLECTION_REF }) => {
  const [teamName, setTeamName] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [answer, setAnswer] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState(null); // 'submitted' | 'timeout' | null
  const [timer, setTimer] = useState(QUESTION_DURATION_SECONDS);

  // Real-time listener for Game State
  useEffect(() => {
    if (!GAME_STATE_DOC_REF) return;
    const unsubscribe = onSnapshot(GAME_STATE_DOC_REF, (docSnap) => {
      if (docSnap.exists()) {
        const newState = docSnap.data();
        setGameState(newState);

        // Reset local submission state when question changes or game resets
        if (newState.status === 'lobby' || newState.currentQuestionIndex !== gameState?.currentQuestionIndex) {
          setSubmissionStatus(null);
          setAnswer('');
        }
      }
    });
    return () => unsubscribe();
  }, [GAME_STATE_DOC_REF, gameState?.currentQuestionIndex]);

  // Timer logic
  useEffect(() => {
    if (!gameState || gameState.status !== 'question' || !gameState.questionStartTime) {
      setTimer(QUESTION_DURATION_SECONDS);
      return;
    }

    // Lock input if already submitted or timed out in the current question
    if (submissionStatus) {
      setTimer(0);
      return;
    }

    const startTimestamp = gameState.questionStartTime.toMillis ? gameState.questionStartTime.toMillis() : gameState.questionStartTime;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimestamp;
      const remaining = QUESTION_DURATION_SECONDS - (elapsed / 1000);
      setTimer(Math.max(0, remaining));

      if (remaining <= 0) {
        clearInterval(interval);
        if (!submissionStatus) {
          setSubmissionStatus('timeout');
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [gameState, submissionStatus]);

  const handleJoin = useCallback(async () => {
    if (!teamName.trim() || !TEAMS_COLLECTION_REF || !userId) return;

    try {
      // 1. Save team name to Firestore
      const teamDocRef = doc(TEAMS_COLLECTION_REF, userId);
      await setDoc(teamDocRef, {
        teamName: teamName.trim(),
        status: 'connected',
        joinedAt: serverTimestamp(),
        userId: userId,
      }, { merge: true });

      // 2. Set local state
      setIsJoined(true);
      console.log("Team joined:", teamName);
    } catch (e) {
      console.error("Error joining team:", e);
    }
  }, [teamName, TEAMS_COLLECTION_REF, userId]);

  const handleSubmit = useCallback(async () => {
    if (!answer.trim() || submissionStatus || timer <= 0 || !SUBMISSIONS_COLLECTION_REF || !gameState || !teamName || !userId) {
      return;
    }

    const questionStartTime = gameState.questionStartTime.toMillis ? gameState.questionStartTime.toMillis() : gameState.questionStartTime;
    const submissionTime = Date.now();
    const timeTakenMs = submissionTime - questionStartTime;

    if (timeTakenMs < 0) {
        console.error("Calculated time taken is negative, aborting submission.");
        return;
    }

    try {
      // Use transaction to ensure unique submission for the question
      await runTransaction(db, async (transaction) => {
        // Check if a submission already exists for this team/question
        const q = query(
          SUBMISSIONS_COLLECTION_REF,
          where('teamId', '==', userId),
          where('questionIndex', '==', gameState.currentQuestionIndex)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          const newDocRef = doc(SUBMISSIONS_COLLECTION_REF);
          transaction.set(newDocRef, {
            teamId: userId,
            teamName: teamName,
            questionIndex: gameState.currentQuestionIndex,
            answer: answer.trim(),
            timeTakenMs: timeTakenMs,
            timestamp: serverTimestamp(),
          });
          setSubmissionStatus('submitted');
        } else {
          // Already submitted, do nothing
          setSubmissionStatus('submitted');
          console.warn("Submission already exists for this question.");
        }
      });
    } catch (e) {
      console.error("Error submitting answer:", e);
    }
  }, [answer, submissionStatus, timer, SUBMISSIONS_COLLECTION_REF, gameState, teamName, userId, db]);

  const displayTimer = Math.floor(timer * 10) / 10;
  const isInputLocked = submissionStatus !== null || timer <= 0;
  const isScreeningComplete = gameState?.status === 'results' && gameState.currentQuestionIndex === TOTAL_QUESTIONS;

  if (!gameState) return <LoadingSpinner />;

  // --- LOBBY/JOIN VIEW ---
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[#E0F2F1] flex items-center justify-center p-4 font-['Roboto'] relative overflow-hidden">
        <HeartBeatAnimation />
        <div className="bg-white/90 p-8 rounded-xl shadow-2xl max-w-lg w-full text-[#263238] border-t-4 border-[#4CAF50] backdrop-blur-sm relative z-10">
          <MedMelodyLogo />
          <h1 className="text-3xl font-extrabold text-[#E91E63] mb-4 text-center font-['Montserrat']">Join Screening Round</h1>
          <p className="text-[#455A64] mb-6 text-center">Enter your unique team name to join the competition.</p>

          <input
            type="text"
            placeholder="Team Name (e.g., The Diagnosers)"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="w-full p-3 mb-4 rounded-lg bg-[#ECEFF1] text-[#263238] placeholder-[#90A4AE] border border-[#B0BEC5] focus:ring-[#4CAF50] focus:border-[#4CAF50]"
          />
          <button
            onClick={handleJoin}
            disabled={teamName.trim().length < 3}
            className={`w-full py-3 rounded-lg text-lg font-bold transition-all duration-200 ${teamName.trim().length >= 3
              ? 'bg-[#4CAF50] hover:bg-[#388E3C] active:bg-[#2E7D32] text-white shadow-md hover:shadow-[#4CAF50]/50'
              : 'bg-[#B0BEC5] text-[#455A64] cursor-not-allowed'
              }`}
          >
            Join Lobby
          </button>
          <p className="mt-4 text-xs text-[#9E9E9E] text-center">Your ID: {userId}</p>
        </div>
      </div>
    );
  }

  // --- WAITING / RESULTS VIEW ---
  if (gameState.status === 'lobby' || isScreeningComplete) {
    return (
      <div className="min-h-screen bg-[#E0F2F1] flex items-center justify-center p-4 font-['Roboto'] relative overflow-hidden">
        <HeartBeatAnimation />
        <div className="text-center relative z-10">
          <MedMelodyLogo />
          {gameState.status === 'lobby' && (
            <>
              <MessageBox
                title={`Welcome, ${teamName}!`}
                message="The Host is setting up the screening round. Please wait for the first song's diagnosis question to begin."
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#FFC107]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="12" y1="20" x2="12" y2="10"/></svg>}
              />
              <p className="mt-6 text-xl text-[#607D8B] animate-pulse">Waiting for Host to Start Question 1...</p>
            </>
          )}
          {isScreeningComplete && (
            <MessageBox
              title={`Screening Complete!`}
              message="All questions answered. Results are being calculated. Check the Host screen for final rankings!"
              icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#673AB7]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
            />
          )}
        </div>
      </div>
    );
  }

  // --- QUESTION ACTIVE VIEW ---
  const timerStyle = timer <= 10 ? 'text-[#E91E63] animate-pulse' : 'text-[#4CAF50]';
  const submitButtonText = isInputLocked
    ? (submissionStatus === 'submitted' ? 'Submitted! Awaiting Next Song/Question...' : (submissionStatus === 'timeout' ? 'Time Up! Awaiting Next Song/Question...' : 'Submitted!'))
    : 'Submit Diagnosis';
    
  const questionParts = gameState.currentQuestionText.split(':');
  const questionHeader = questionParts[0].trim();
  const questionDetails = questionParts.slice(1).join(':').trim();

  return (
    <div className="min-h-screen bg-[#E0F2F1] p-4 sm:p-8 flex flex-col items-center font-['Roboto'] relative overflow-hidden">
      <HeartBeatAnimation />
      <header className="w-full max-w-4xl text-center mb-6 relative z-10">
        <p className="text-xl font-semibold text-[#607D8B] mb-2">Team: <span className="text-[#E91E63]">{teamName}</span></p>
        <h1 className="4xl sm:text-5xl font-extrabold text-[#4CAF50] font-['Montserrat']">
          {questionHeader}
        </h1>
        {questionDetails && (
          <p className="text-xl mt-2 text-[#263238] font-bold">{questionDetails}</p>
        )}
      </header>

      <main className="w-full max-w-4xl bg-white/90 p-6 sm:p-8 rounded-xl shadow-2xl border-t-4 border-[#2196F3] backdrop-blur-sm relative z-10">
        {/* Timer */}
        <div className="text-center mb-8 bg-[#E1F5FE] p-4 rounded-lg border border-[#BBDEFB]">
          <p className="text-lg text-[#607D8B] font-mono uppercase">Time Remaining</p>
          <p className={`text-7xl font-mono font-extrabold transition-colors duration-500 ${timerStyle}`}>
            {displayTimer.toFixed(1)}
          </p>
        </div>

        {/* Input Area */}
        <textarea
          placeholder={isInputLocked ? (submissionStatus === 'submitted' ? 'Awaiting next song...' : 'Time is up! Your answer was not recorded.') : "Type your diagnosis here..."}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={isInputLocked}
          rows="4"
          className={`w-full p-4 mb-6 rounded-lg text-lg bg-[#ECEFF1] text-[#263238] placeholder-[#90A4AE] border-2 transition-all duration-300 shadow-inner
            ${isInputLocked ? 'opacity-70 cursor-not-allowed border-[#B0BEC5]' : 'border-[#4CAF50] focus:ring-[#4CAF50] focus:border-[#4CAF50]'}`
          }
        />

        {/* Submission Button */}
        <button
          onClick={handleSubmit}
          disabled={isInputLocked || answer.trim().length < 2}
          className={`w-full py-4 rounded-lg text-xl font-bold transition-all duration-200 shadow-lg
            ${isInputLocked
              ? 'bg-[#B0BEC5] text-[#455A64] cursor-not-allowed opacity-80'
              : 'bg-[#FF6B6B] hover:bg-[#E53935] active:bg-[#C62828] text-white hover:shadow-[#FF6B6B]/60'
            }`}
        >
          {submitButtonText}
        </button>

        {submissionStatus === 'submitted' && (
          <p className="mt-4 text-center text-[#4CAF50] font-semibold">
            Diagnosis successfully submitted! Get ready for the next song.
          </p>
        )}
        {submissionStatus === 'timeout' && (
          <p className="mt-4 text-center text-[#E91E63] font-semibold">
            Time expired! Your submission was too late and not recorded.
          </p>
        )}
      </main>
    </div>
  );
};

// --- MAIN APP COMPONENT ---

const App = () => {
  const [authCode, setAuthCode] = useState('');
  const [role, setRole] = useState(null); // 'host' | 'team' | null
  const [error, setError] = useState(null);

  const { db, auth, userId, isAuthReady, GAME_STATE_DOC_REF, TEAMS_COLLECTION_REF, SUBMISSIONS_COLLECTION_REF } = useFirebase();

  const handleAuth = () => {
    setError(null);
    if (authCode === HOST_AUTH_CODE) {
      setRole('host');
    } else if (authCode === TEAM_AUTH_CODE) {
      setRole('team');
    } else {
      setError("Invalid Auth Code. Please check the code and try again.");
    }
  };

  if (!isAuthReady || !db) return <LoadingSpinner />;

  // Initial Auth Gate
  if (!role) {
    return (
      <div className="min-h-screen bg-[#E0F2F1] flex items-center justify-center p-4 font-['Roboto'] relative overflow-hidden">
        <HeartBeatAnimation />
        <div className="bg-white/90 p-8 rounded-xl shadow-2xl max-w-sm w-full text-[#263238] border-t-4 border-[#673AB7] backdrop-blur-sm relative z-10">
          <MedMelodyLogo />
          <h1 className="text-3xl font-extrabold text-[#673AB7] mb-4 text-center font-['Montserrat']">Med Melody Access</h1>
          <p className="text-[#455A64] mb-6 text-center">Enter your access code (Host or Team).</p>

          <input
            type="text" // CHANGED from 'password' to 'text'
            placeholder="Enter Auth Code"
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            className="w-full p-3 mb-4 rounded-lg bg-[#ECEFF1] text-[#263238] placeholder-[#90A4AE] border border-[#B0BEC5] focus:ring-[#673AB7] focus:border-[#673AB7]"
          />
          <button
            onClick={handleAuth}
            disabled={authCode.length < 5}
            className={`w-full py-3 rounded-lg text-lg font-bold transition-all duration-200 shadow-md ${authCode.length >= 5
              ? 'bg-[#673AB7] hover:bg-[#5E35B1] active:bg-[#4527A0] text-white hover:shadow-[#673AB7]/50'
              : 'bg-[#B0BEC5] text-[#455A64] cursor-not-allowed'
              }`}
          >
            Enter
          </button>
          {error && <p className="mt-4 text-[#E91E63] text-center text-sm font-semibold">{error}</p>}
        </div>
      </div>
    );
  }

  // Render Role-specific screen
  if (role === 'host') {
    return (
      <HostScreen
        userId={userId}
        db={db}
        GAME_STATE_DOC_REF={GAME_STATE_DOC_REF}
        TEAMS_COLLECTION_REF={TEAMS_COLLECTION_REF}
        SUBMISSIONS_COLLECTION_REF={SUBMISSIONS_COLLECTION_REF}
      />
    );
  }

  if (role === 'team') {
    return (
      <TeamScreen
        userId={userId}
        db={db}
        GAME_STATE_DOC_REF={GAME_STATE_DOC_REF}
        TEAMS_COLLECTION_REF={TEAMS_COLLECTION_REF}
        SUBMISSIONS_COLLECTION_REF={SUBMISSIONS_COLLECTION_REF}
      />
    );
  }

  return <LoadingSpinner />; // Should not be reached
};

export default App;
