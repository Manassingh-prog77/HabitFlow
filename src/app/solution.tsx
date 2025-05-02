"use client";
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
     Moon, Droplet, Monitor, Flame, Calendar, X, PlusCircle, Trash2, FolderPlus, FolderMinus, Folder, // Added Folder icons
    CheckSquare,  Activity, BookOpen, Coffee, Dumbbell
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
   CartesianGrid, 
} from 'recharts';
import { v4 as uuidv4 } from 'uuid';
  // Tooltip remains largely the same, but relies on filtered chartData
  import { TooltipProps } from 'recharts';

// --- Icon Mapping ---
const ICONS: { [key: string]: React.ComponentType<React.SVGProps<SVGSVGElement>> } = {
  Moon: Moon, Droplet: Droplet, Monitor: Monitor, CheckSquare: CheckSquare, Activity: Activity,
  BookOpen: BookOpen, Coffee: Coffee, Dumbbell: Dumbbell, Folder: Folder, // Added Folder
};
const DEFAULT_ICON_NAME = 'CheckSquare';
const DEFAULT_COLLECTION_ICON_NAME = 'Folder';

// --- Define Types ---
type HabitDefinition = {
  id: string; // Unique within the entire app
  name: string;
  unit: string;
  iconName: string;
  color: string;
  sliderMax: number;
  sliderStep: number;
};

// New type for Collections
type HabitCollection = {
    id: string; // Unique collection ID
    name: string;
    iconName: string; // Icon for the collection itself
    habits: HabitDefinition[]; // Habits within this collection
};

type HabitValues = {
  [habitId: string]: number; // Global map of habitId -> value
};

type HistoryEntry = {
  date: string;
  values: HabitValues; // History still stores all values globally
};

type ChartDataEntry = {
  date: string;
  day: string;
  [habitId: string]: number | string; // Only habits from the active collection will be populated here
};

// --- Initial Default Collection Structure ---
const INITIAL_DEFAULT_COLLECTION: HabitCollection = {
    id: 'default_collection_01',
    name: 'Default',
    iconName: DEFAULT_COLLECTION_ICON_NAME,
    habits: [
        { id: 'default_sleep', name: 'Sleep', unit: 'hrs', iconName: 'Moon', color: 'teal', sliderMax: 12, sliderStep: 0.5 },
        { id: 'default_water', name: 'Water', unit: 'glasses', iconName: 'Droplet', color: 'blue', sliderMax: 12, sliderStep: 1 },
        { id: 'default_screen', name: 'Screen Time', unit: 'hrs', iconName: 'Monitor', color: 'orange', sliderMax: 12, sliderStep: 0.5 },
    ]
};

// --- Helper Function for Dynamic Tailwind Classes ---
const getTailwindColorClasses = (color: string) => {
  // (color map remains the same)
  const colorMap: { [key: string]: { bg: string; text: string; slider: string; hoverBg: string; border: string, chartFill: string } } = { teal: { bg: 'bg-teal-600', text: 'text-teal-600', slider: 'slider-teal', hoverBg: 'hover:bg-teal-700', border: 'border-teal-600', chartFill: '#0d9488' }, blue: { bg: 'bg-blue-600', text: 'text-blue-600', slider: 'slider-blue', hoverBg: 'hover:bg-blue-700', border: 'border-blue-600', chartFill: '#3b82f6' }, orange: { bg: 'bg-orange-600', text: 'text-orange-600', slider: 'slider-orange', hoverBg: 'hover:bg-orange-700', border: 'border-orange-600', chartFill: '#f97316' }, red: { bg: 'bg-red-600', text: 'text-red-600', slider: 'slider-red', hoverBg: 'hover:bg-red-700', border: 'border-red-600', chartFill: '#ef4444' }, purple: { bg: 'bg-purple-600', text: 'text-purple-600', slider: 'slider-purple', hoverBg: 'hover:bg-purple-700', border: 'border-purple-600', chartFill: '#a855f7' }, green: { bg: 'bg-green-600', text: 'text-green-600', slider: 'slider-green', hoverBg: 'hover:bg-green-700', border: 'border-green-600', chartFill: '#22c55e' }, pink: { bg: 'bg-pink-600', text: 'text-pink-600', slider: 'slider-pink', hoverBg: 'hover:bg-pink-700', border: 'border-pink-600', chartFill: '#ec4899' }, indigo: { bg: 'bg-indigo-600', text: 'text-indigo-600', slider: 'slider-indigo', hoverBg: 'hover:bg-indigo-700', border: 'border-indigo-600', chartFill: '#6366f1' } }; return colorMap[color] || colorMap.teal;
};

const HABIT_COLORS = ['red', 'purple', 'green', 'pink', 'indigo', 'teal', 'blue', 'orange'];
let colorIndex = 0;

// --- LocalStorage Keys ---
const LS_COLLECTIONS_KEY = 'habitflowCollections_v2'; // Use new key for new structure
const LS_HISTORY_KEY = 'habitflowHistory';
const LS_ACTIVE_COLLECTION_ID_KEY = 'habitflowActiveCollectionId_v2';
const LS_ACTIVE_HABIT_ID_KEY = 'habitflowActiveHabitId'; // Keep for mobile chart toggle

// --- Main Component ---
export default function HabitFlowApp() {
  // State for collections and active IDs
  const [collections, setCollections] = useState<HabitCollection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [activeHabitId, setActiveHabitId] = useState<string>(''); // For mobile chart toggle within active collection

  // Other existing state
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showAddHabitModal, setShowAddHabitModal] = useState(false);
  const [showAddCollectionModal, setShowAddCollectionModal] = useState(false);
  const [sliderValues, setSliderValues] = useState<HabitValues>({}); // Still global for today's values
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [streak, setStreak] = useState(0); // Will reflect active collection
  const [totalDaysLogged, setTotalDaysLogged] = useState(0); // Will reflect active collection
  const [savedToday, setSavedToday] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  // --- Memoized Derived State ---
  // Get the currently active collection object
  const activeCollection = useMemo(() => {
    if (!activeCollectionId) return null;
    return collections.find(c => c.id === activeCollectionId);
  }, [collections, activeCollectionId]);

  // Get the habits belonging to the active collection
  const activeCollectionHabits = useMemo(() => {
    return activeCollection?.habits || [];
  }, [activeCollection]);

  // --- Effects ---

  // Load data from localStorage on initial render
  useEffect(() => {
    // Load Collections
    const storedCollections = localStorage.getItem(LS_COLLECTIONS_KEY);
    let currentCollections: HabitCollection[] = [];
    if (storedCollections) {
      try {
        currentCollections = JSON.parse(storedCollections) as HabitCollection[];
        // Basic validation: ensure it's an array and first item looks like a collection
        if (!Array.isArray(currentCollections) || (currentCollections.length > 0 && !currentCollections[0].habits)) {
           console.warn("Invalid collection data found in localStorage. Resetting.");
           currentCollections = [INITIAL_DEFAULT_COLLECTION];
        }
        // Ensure habits within collections have iconName (migration)
        currentCollections = currentCollections.map(col => ({
            ...col,
            iconName: col.iconName || DEFAULT_COLLECTION_ICON_NAME,
            habits: col.habits.map(h => ({...h, iconName: h.iconName || DEFAULT_ICON_NAME }))
        }));
      } catch (e) {
        console.error("Failed to parse stored collections:", e);
        currentCollections = [INITIAL_DEFAULT_COLLECTION]; // Fallback
      }
    } else {
      currentCollections = [INITIAL_DEFAULT_COLLECTION]; // First time load
    }
    setCollections(currentCollections);

    // Load Active Collection ID
    const storedActiveCollectionId = localStorage.getItem(LS_ACTIVE_COLLECTION_ID_KEY);
    let currentActiveCollectionId: string | null = null;
    if (storedActiveCollectionId && currentCollections.some(c => c.id === storedActiveCollectionId)) {
        currentActiveCollectionId = storedActiveCollectionId;
    } else if (currentCollections.length > 0) {
        currentActiveCollectionId = currentCollections[0].id; // Default to first collection
    }
    setActiveCollectionId(currentActiveCollectionId);

    // Load Active Habit ID (for mobile chart toggle)
    const initialActiveCollection = currentCollections.find(c => c.id === currentActiveCollectionId);
    const initialActiveHabits = initialActiveCollection?.habits || [];
    const storedActiveHabitId = localStorage.getItem(LS_ACTIVE_HABIT_ID_KEY);
    if (storedActiveHabitId && initialActiveHabits.some(h => h.id === storedActiveHabitId)) {
        setActiveHabitId(storedActiveHabitId);
    } else if (initialActiveHabits.length > 0) {
        setActiveHabitId(initialActiveHabits[0].id); // Default to first habit in active collection
    } else {
        setActiveHabitId('');
    }

    // Load History
    const storedHistory = localStorage.getItem(LS_HISTORY_KEY);
    let parsedHistory: HistoryEntry[] = [];
    if (storedHistory) { try { parsedHistory = JSON.parse(storedHistory); } catch (e) { console.error("Failed to parse history", e); } }
    setHistory(parsedHistory);

    // Initialize Slider Values (for ALL habits initially, needed for saving)
    const allHabitIds = currentCollections.flatMap(c => c.habits.map(h => h.id));
    const initialSliderValues: HabitValues = {};
    allHabitIds.forEach(habitId => { initialSliderValues[habitId] = 0; });

    const today = new Date().toISOString().split('T')[0];
    const todayEntry = parsedHistory.find(entry => entry.date === today);
    if (todayEntry) {
      setSavedToday(true);
      // Load saved values, merging with defaults for potentially new habits
      setSliderValues(() => ({
        ...initialSliderValues,
        ...todayEntry.values
      }));
      
    } else {
      setSliderValues(initialSliderValues);
      // Show reminder only if collections exist and history exists
      if (currentCollections.length > 0 && parsedHistory.length > 0) {
        // setShowReminderModal(true);
      }
    }

    // Initial Stat Calculation (will be recalculated when activeCollectionId changes)
    // Pass the habits of the initially active collection
    // updateStats(parsedHistory, initialActiveHabits); // We'll call updateStats in a separate effect

    setIsLoaded(true);
  }, []); // Run only once on mount

  // Save collections whenever they change
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(LS_COLLECTIONS_KEY, JSON.stringify(collections));

    // Adjust slider values if habits changed within collections
    setSliderValues(prev => {
      const newSliderValues: HabitValues = {};
      collections.flatMap(c => c.habits).forEach(habit => {
        newSliderValues[habit.id] = prev[habit.id] || 0; // Keep existing or default
      });
      return newSliderValues;
    });

  }, [collections, isLoaded]);

  // --- Stat Calculation (Now depends on active collection habits) ---
  const updateStats = useCallback((historyData: HistoryEntry[], currentCollectionHabits: HabitDefinition[]) => {
    if (!currentCollectionHabits || currentCollectionHabits.length === 0) {
      setStreak(0);
      setTotalDaysLogged(0);
      return;
    }

    const habitIdsInCollection = new Set(currentCollectionHabits.map(h => h.id));

    // Filter history to entries relevant to this collection
    // A day is relevant if at least one habit *in this collection* was logged > 0
    const relevantHistory = historyData.filter(entry =>
        Object.entries(entry.values).some(([habitId, value]) =>
            habitIdsInCollection.has(habitId) && value > 0
        )
    );

    const total = relevantHistory.length;
    setTotalDaysLogged(total);

    // Calculate streak based on relevant days
    let currentStreak = 0;
    const sortedHistory = [...relevantHistory].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    if (sortedHistory.length === 0) { setStreak(0); return; }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    let expectedDate = new Date(today);

    for (let i = 0; i < sortedHistory.length; i++) {
      const entryDate = new Date(sortedHistory[i].date); entryDate.setHours(0, 0, 0, 0);
      if (entryDate.getTime() === expectedDate.getTime()) {
        currentStreak++;
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else if (entryDate.getTime() < expectedDate.getTime()) {
        // Allow gaps in streak calculation (e.g., Sat -> Mon is still a streak if Sun wasn't relevant)
         const diffDays = (expectedDate.getTime() - entryDate.getTime()) / (1000 * 3600 * 24);
         if (diffDays === 1) {
             // This entry is the day before the previously expected date.
             // It means we found the next day in the streak.
             currentStreak++;
             expectedDate = new Date(entryDate); // Set the new expected date to the day before this entry
             expectedDate.setDate(expectedDate.getDate() - 1);
         } else {
            // Gap is larger than 1 day, streak broken.
             break;
         }

      }
    }

    // Check if the most recent relevant log date is today or yesterday
    const mostRecentDate = new Date(sortedHistory[0].date); mostRecentDate.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (mostRecentDate.getTime() !== today.getTime() && mostRecentDate.getTime() !== yesterday.getTime()) {
        // If the most recent relevant log wasn't today or yesterday, reset streak.
        currentStreak = 0;
    }


    setStreak(currentStreak);
  }, []); // Dependencies are handled in the calling useEffect

  // Save active collection ID
  useEffect(() => {
    if (!isLoaded) return;
    if (activeCollectionId) {
      localStorage.setItem(LS_ACTIVE_COLLECTION_ID_KEY, activeCollectionId);
    } else {
      localStorage.removeItem(LS_ACTIVE_COLLECTION_ID_KEY);
    }
    // Recalculate stats when active collection changes
    updateStats(history, activeCollectionHabits);

    // Reset active habit ID if the collection doesn't have it or is empty
    const currentActiveHabits = collections.find(c => c.id === activeCollectionId)?.habits || [];
    if (!currentActiveHabits.some(h => h.id === activeHabitId)) {
        setActiveHabitId(currentActiveHabits.length > 0 ? currentActiveHabits[0].id : '');
    }

  }, [activeCollectionId, isLoaded, history, activeCollectionHabits,activeHabitId,collections,updateStats]); // Recalculate stats on history change too

  // Save active habit ID (for mobile toggle)
  useEffect(() => {
    if (!isLoaded) return;
    // Only save if it belongs to a valid habit in the active collection
    if (activeHabitId && activeCollectionHabits.some(h => h.id === activeHabitId)) {
      localStorage.setItem(LS_ACTIVE_HABIT_ID_KEY, activeHabitId);
    } else {
        // If invalid (e.g., habit deleted, collection changed), remove or reset
        localStorage.removeItem(LS_ACTIVE_HABIT_ID_KEY);
        // Optionally reset to first habit of active collection if needed
        // if (activeCollectionHabits.length > 0) setActiveHabitId(activeCollectionHabits[0].id);
    }
  }, [activeHabitId, activeCollectionHabits, isLoaded]);


  // --- Chart Data Preparation (Filters by active collection) ---
  const getLast7DaysData = useCallback((): ChartDataEntry[] => {
    const last7Days: ChartDataEntry[] = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(); date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const entry = history.find(item => item.date === dateStr);
      const dayData: ChartDataEntry = { date: dateStr, day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()] };

      // Only include data for habits in the active collection
      activeCollectionHabits.forEach(habit => {
        dayData[habit.id] = entry ? (entry.values[habit.id] || 0) : 0;
      });

      last7Days.push(dayData);
    }
    return last7Days;
  }, [history, activeCollectionHabits]);

  // --- Event Handlers ---
  const handleSliderChange = (habitId: string, value: number) => {
    setSliderValues(prev => ({ ...prev, [habitId]: value }));
    if (savedToday) { setSavedToday(false); }
  };

  const handleSaveToday = () => {
    const today = new Date().toISOString().split('T')[0];
    const filteredHistory = history.filter(entry => entry.date !== today);
    // Important: Save the *entire* sliderValues state, which includes all habits' current values
    const newHistoryEntry: HistoryEntry = { date: today, values: sliderValues };
    const newHistory = [...filteredHistory, newHistoryEntry].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    setHistory(newHistory); // This will trigger the useEffect to recalculate stats
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(newHistory));
    setSavedToday(true);
    // updateStats is now called via useEffect depending on history
    if (showReminderModal) { setShowReminderModal(false); }
  };

  // --- Collection Management Handlers ---
  const handleAddCollection = (name: string) => {
    if (!name.trim()) return;
    const newCollection: HabitCollection = {
        id: `collection_${uuidv4()}`,
        name: name.trim(),
        iconName: DEFAULT_COLLECTION_ICON_NAME,
        habits: [] // Starts empty
    };
    const updatedCollections = [...collections, newCollection];
    setCollections(updatedCollections);
    setActiveCollectionId(newCollection.id); // Activate the new collection
    setShowAddCollectionModal(false);
  };

    const handleRemoveCollection = (collectionIdToRemove: string) => {
        const collectionToRemove = collections.find(c => c.id === collectionIdToRemove);
        if (!collectionToRemove) return;

        // Prevent removing the last collection? Optional, but good UX.
        if (collections.length <= 1) {
            alert("Cannot remove the last collection.");
            return;
        }

        if (!window.confirm(`Are you sure you want to remove the collection "${collectionToRemove.name}" and all habits within it? This cannot be undone.`)) {
            return;
        }

        // Get IDs of habits being removed
        const habitIdsToRemove = new Set(collectionToRemove.habits.map(h => h.id));

        // Filter out the collection
        const remainingCollections = collections.filter(c => c.id !== collectionIdToRemove);
        setCollections(remainingCollections);

        // Clean up slider values state
        setSliderValues(prev => {
            const updated = { ...prev };
            habitIdsToRemove.forEach(id => delete updated[id]);
            return updated;
        });

        // Optional: Clean up history (remove values associated with deleted habits)
        const updatedHistory = history.map(entry => {
            const newValues = { ...entry.values };
            let changed = false;
            habitIdsToRemove.forEach(id => {
                if (newValues.hasOwnProperty(id)) {
                    delete newValues[id];
                    changed = true;
                }
            });
            // Return a new object only if values changed to potentially filter empty entries later
            return changed ? { ...entry, values: newValues } : entry;
        }).filter(entry => Object.keys(entry.values).length > 0); // Keep only entries with some data left

        setHistory(updatedHistory);
        localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(updatedHistory));

        // If the removed collection was active, switch to the first remaining one
        if (activeCollectionId === collectionIdToRemove) {
            setActiveCollectionId(remainingCollections.length > 0 ? remainingCollections[0].id : null);
        }

        // Recalculate stats (will be done by useEffect)
    };


  // --- Habit Management Handlers (Now Collection-Aware) ---
  const handleAddHabit = (newHabitData: Omit<HabitDefinition, 'id' | 'iconName' | 'color'>) => {
    if (!activeCollectionId) return; // Should not happen if UI is correct

    const nextColor = HABIT_COLORS[colorIndex % HABIT_COLORS.length]; colorIndex++;
    const newHabit: HabitDefinition = {
      ...newHabitData,
      id: `habit_${uuidv4()}`, // Ensure habit IDs are unique globally
      iconName: DEFAULT_ICON_NAME,
      color: nextColor,
    };

    setCollections(prevCollections =>
      prevCollections.map(collection =>
        collection.id === activeCollectionId
          ? { ...collection, habits: [...collection.habits, newHabit] }
          : collection
      )
    );
    setShowAddHabitModal(false);
  };

  const handleRemoveHabit = (habitIdToRemove: string) => {
    if (!activeCollectionId) return;

    const habitToRemove = activeCollectionHabits.find(h => h.id === habitIdToRemove);
    if (!habitToRemove) return;

    if (!window.confirm(`Are you sure you want to remove the habit "${habitToRemove.name}" from the "${activeCollection?.name}" collection?`)) { return; }

    // Remove habit from the specific collection
    setCollections(prevCollections =>
        prevCollections.map(collection =>
            collection.id === activeCollectionId
             ? { ...collection, habits: collection.habits.filter(h => h.id !== habitIdToRemove) }
             : collection
        )
    );

    // Clean up slider values state
    setSliderValues(prev => { const updated = { ...prev }; delete updated[habitIdToRemove]; return updated; });

    // Optional: Clean up history
    const updatedHistory = history.map(entry => {
        const newValues = { ...entry.values };
        if (newValues.hasOwnProperty(habitIdToRemove)) { delete newValues[habitIdToRemove]; }
        return { ...entry, values: newValues };
    }).filter(entry => Object.keys(entry.values).length > 0);
    setHistory(updatedHistory);
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(updatedHistory));
    // Stats will update via useEffect

     // If the removed habit was the active one for mobile charts, select another one
     if (activeHabitId === habitIdToRemove) {
        const remainingHabits = activeCollectionHabits.filter(h => h.id !== habitIdToRemove);
        setActiveHabitId(remainingHabits.length > 0 ? remainingHabits[0].id : '');
     }
  };

  // Other handlers
  const toggleReminderModal = () => setShowReminderModal(!showReminderModal);
  const handleLogNow = () => {
    setShowReminderModal(false);
    if (sliderRef.current) { sliderRef.current.scrollIntoView({ behavior: 'smooth' }); }
  };

  // --- Derived State & Variables ---
  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  // Check if all habits *in the active collection* are set
  const allValuesInCollectionSet = activeCollectionHabits.length > 0 && activeCollectionHabits.every(habit => (sliderValues[habit.id] || 0) > 0);
  const chartData = useMemo(() => getLast7DaysData(), [getLast7DaysData]); // Memoize chart data calculation
  const activeHabitDefinition = useMemo(() => activeCollectionHabits.find(h => h.id === activeHabitId), [activeCollectionHabits, activeHabitId]);
  const formatXAxis = (dateStr: string) => dateStr.slice(5);

  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length && activeCollectionHabits) {
        const date = new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return ( <div className="bg-white p-2 shadow-md rounded-md border border-slate-200 text-sm"> <p className="font-medium mb-1">{date}</p>
            {payload.map((entry: { dataKey: string; name: string; value: number }) => {
              // Find habit within the active collection for units/colors
              const habit = activeCollectionHabits.find(h => h.id === entry.dataKey);
              if (!habit) return null;
              const colorClass = getTailwindColorClasses(habit.color).text;
              return ( <p key={entry.dataKey} className={`${colorClass}`}> {entry.name}: {entry.value} {habit.unit} </p> );
            })} </div> );
      } return null;
  };

  // --- Render ---
  if (!isLoaded) { return <div className="flex justify-center items-center min-h-screen">Loading...</div>; }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Navbar */}
      <nav className="bg-white shadow-md px-5 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center"> <div className="text-teal-600 font-bold text-2xl">HabitFlow</div> </div>
        <div className="flex items-center space-x-5"> <div className="text-slate-600 hidden sm:block">{currentDate}</div> </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl"> {/* Increased max-width slightly */}

        {/* Collection Selector Area */}
        <section className="mb-6">
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-xl font-semibold text-slate-700">Collections</h2>
                <button
                    onClick={() => setShowAddCollectionModal(true)}
                    className="flex items-center px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm"
                    title="Add New Collection"
                >
                    <FolderPlus size={16} className="mr-1.5" /> Add Collection
                </button>
            </div>
            {collections.length > 0 ? (
                <div className="flex flex-wrap gap-2 items-center bg-white p-2 rounded-xl shadow">
                    {collections.map(collection => {
                        const isActive = collection.id === activeCollectionId;
                        const CollectionIcon = ICONS[collection.iconName] || ICONS[DEFAULT_COLLECTION_ICON_NAME];
                        return (
                            <div key={collection.id} className={`relative group flex items-center pl-3 pr-2 py-1.5 rounded-lg cursor-pointer border transition-colors duration-150 ${isActive ? 'bg-teal-100 border-teal-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300'}`} onClick={() => setActiveCollectionId(collection.id)}>
                                <CollectionIcon width={18} height={18} className={`mr-2 ${isActive ? 'text-teal-700' : 'text-slate-500'}`} />
                                <span className={`font-medium text-sm ${isActive ? 'text-teal-800' : 'text-slate-700'}`}>{collection.name}</span>
                                {/* Delete button for collection */}
                                {collections.length > 1 && ( // Show only if more than one collection exists
                                     <button
                                        onClick={(e) => { e.stopPropagation(); handleRemoveCollection(collection.id); }}
                                        className={`ml-2 p-0.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? 'opacity-100 sm:opacity-0' : ''}`} // Keep visible if active on small screens
                                        title={`Remove ${collection.name}`}
                                    >
                                        <FolderMinus size={14} />
                                    </button>
                                )}

                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center text-slate-500 py-4">Create your first collection!</div>
            )}
        </section>

        {/* Daily Check-In Panel (Filtered by Active Collection) */}
        {activeCollection ? (
          <section className="mb-8" ref={sliderRef}>
            <div className="flex justify-between items-center mb-5">
                {/* Title shows active collection name */}
              <h2 className="text-2xl font-bold text-slate-800">Log {activeCollection.name} Habits</h2>
              <button onClick={() => setShowAddHabitModal(true)} className="flex items-center px-3 py-1.5 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors shadow-sm" title={`Add Habit to ${activeCollection.name}`}>
                <PlusCircle size={16} className="mr-1.5" /> Add Habit
              </button>
            </div>

            {activeCollectionHabits.length > 0 ? (
              <div className="space-y-4">
                {activeCollectionHabits.map((habit) => {
                  const colorClasses = getTailwindColorClasses(habit.color);
                  const IconComponent = ICONS[habit.iconName] || ICONS[DEFAULT_ICON_NAME];
                  const progressPercent = habit.sliderMax > 0 ? ((sliderValues[habit.id] || 0) / habit.sliderMax) * 100 : 0;

                  return (
                    <div key={habit.id} className="bg-white p-5 rounded-2xl shadow-md hover:shadow-lg transition-shadow duration-200 relative group">
                      <div className="flex items-center mb-3">
                        <IconComponent width={22} height={22} className={colorClasses.text} />
                        <h3 className="ml-3 text-xl font-medium text-slate-700">{habit.name}</h3>
                      </div>
                      <div className="flex items-center space-x-4">
                        <input type="range" min="0" max={habit.sliderMax} step={habit.sliderStep}
                          value={sliderValues[habit.id] || 0}
                          onChange={(e) => handleSliderChange(habit.id, parseFloat(e.target.value))}
                          style={{ '--value-percent': `${progressPercent}%` } as React.CSSProperties}
                          className={`
                            w-full h-2 appearance-none cursor-pointer
                            [&::-webkit-slider-runnable-track]:h-2
                            [&::-webkit-slider-runnable-track]:bg-emerald-200
                            [&::-webkit-slider-runnable-track]:rounded-full
                            [&::-moz-range-track]:h-2
                            [&::-moz-range-track]:bg-emerald-200
                            [&::-moz-range-track]:rounded-full
                        
                            /* Thumb styling */
                            [&::-webkit-slider-thumb]:appearance-none
                            [&::-webkit-slider-thumb]:w-5
                            [&::-webkit-slider-thumb]:h-5
                            [&::-webkit-slider-thumb]:rounded-full
                            [&::-webkit-slider-thumb]:bg-emerald-600
                            [&::-webkit-slider-thumb]:shadow-lg
                            [&::-webkit-slider-thumb]:border-2
                            [&::-webkit-slider-thumb]:border-white
                            [&::-webkit-slider-thumb]:mt-[-6px] /* center thumb vertically */
                        
                            [&::-moz-range-thumb]:appearance-none
                            [&::-moz-range-thumb]:w-5
                            [&::-moz-range-thumb]:h-5
                            [&::-moz-range-thumb]:rounded-full
                            [&::-moz-range-thumb]:bg-emerald-600
                            [&::-moz-range-thumb]:shadow-lg
                            [&::-moz-range-thumb]:border-2
                            [&::-moz-range-thumb]:border-white
                          `}
                        />
                        <span className="text-lg font-medium w-20 text-center text-slate-700"> {sliderValues[habit.id] || 0} {habit.unit} </span>
                      </div>
                      <button onClick={() => handleRemoveHabit(habit.id)} className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10" title={`Remove ${habit.name}`}>
                        <Trash2 size={16} />
                      </button>
                    </div> );
                })}
              </div>
            ) : ( <div className="bg-white p-5 rounded-2xl shadow-md text-center text-slate-600"> No habits in {activeCollection.name} yet. Click {"Add Habit"}. </div> )}

            {activeCollectionHabits.length > 0 && (
               <button
                  className={`mt-5 py-3 px-6 rounded-xl text-white font-medium w-full transition-all duration-200 ${allValuesInCollectionSet && !savedToday
                      ? `${getTailwindColorClasses('teal').bg} ${getTailwindColorClasses('teal').hoverBg} shadow-md hover:shadow-lg`
                      : savedToday ? 'bg-green-600 cursor-not-allowed' : 'bg-slate-400 cursor-not-allowed'}`}
                  disabled={!allValuesInCollectionSet || savedToday} onClick={handleSaveToday} >
                  {savedToday ? 'Saved for Today ✓' : 'Save Today'}
               </button>
            )}
          </section>
        ) : (
             <div className="text-center text-slate-500 py-6">
                {collections.length > 0 ? "Select a collection above." : "Create a collection to start tracking."}
             </div>
        )}


        {/* Weekly Progress Charts - Mobile (Filtered) */}
        {activeCollection && activeCollectionHabits.length > 0 && activeHabitDefinition && (
          <section className="mb-8 sm:hidden">
            <h2 className="text-2xl font-bold mb-4 text-slate-800">{activeCollection.name} Weekly Progress</h2>
             <div className="flex flex-wrap bg-white rounded-xl shadow-md mb-4 p-1 gap-1">
                 {/* Only show toggles for habits in the active collection */}
                 {activeCollectionHabits.map(habit => {
                     const isActive = activeHabitId === habit.id;
                     const activeBgClass = `bg-${habit.color}-100`; const activeTextClass = `text-${habit.color}-800`;
                     return ( <button key={habit.id} className={`flex-grow basis-1/3 py-2 px-1 text-center rounded-lg transition-colors duration-200 text-sm ${isActive ? `${activeBgClass} ${activeTextClass}` : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => setActiveHabitId(habit.id)} > {habit.name} </button> );
                 })}
             </div>
             <div className="bg-white p-4 rounded-2xl shadow-md">
               <div className="text-center py-4">
                 <h3 className={`text-lg font-medium ${getTailwindColorClasses(activeHabitDefinition.color).text} mb-2`}> {activeHabitDefinition.name} - Last 7 Days </h3>
                 <ResponsiveContainer width="100%" height={240}>
                   <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} />
                     <XAxis dataKey="date" tickFormatter={formatXAxis} angle={-45} textAnchor="end" height={50} />
                     <YAxis />
                     <Tooltip content={<CustomTooltip />} />
                     {/* dataKey uses activeHabitId, which is within the active collection */}
                     <Bar dataKey={activeHabitId} name={activeHabitDefinition.name} fill={getTailwindColorClasses(activeHabitDefinition.color).chartFill} />
                   </BarChart>
                 </ResponsiveContainer>
               </div>
             </div>
          </section>
        )}

        {/* Weekly Progress Charts - Desktop (Filtered) */}
        {activeCollection && activeCollectionHabits.length > 0 && (
           <section className="mb-8 hidden sm:block">
             <h2 className="text-2xl font-bold mb-5 text-slate-800">{activeCollection.name} Weekly Progress</h2>
             {/* Adjust grid columns based on number of habits in collection */}
             <div className={`grid grid-cols-1 ${activeCollectionHabits.length >= 2 ? 'md:grid-cols-2' : ''} ${activeCollectionHabits.length >= 3 ? 'lg:grid-cols-3' : ''} gap-4`}>
                 {activeCollectionHabits.map((habit) => { // Map only over active habits
                     const colorClasses = getTailwindColorClasses(habit.color);
                     return (
                         <div key={habit.id} className="bg-white p-4 rounded-2xl shadow-md">
                           <h3 className={`text-lg font-medium ${colorClasses.text} mb-2 text-center`}>{habit.name}</h3>
                           <ResponsiveContainer width="100%" height={180}>
                             {/* Chart uses data filtered by getLast7DaysData */}
                             <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 20 }}>
                               <CartesianGrid strokeDasharray="3 3" vertical={false} />
                               <XAxis dataKey="date" tickFormatter={formatXAxis} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 10 }} />
                               <YAxis tick={{ fontSize: 10 }} />
                               <Tooltip content={<CustomTooltip />} />
                               <Bar dataKey={habit.id} name={habit.name} fill={colorClasses.chartFill} />
                             </BarChart>
                           </ResponsiveContainer>
                         </div> );
                 })}
             </div>
           </section>
        )}

        {/* Streak & Stats Widget (Filtered by Active Collection) */}
        {activeCollection && history.length > 0 && ( // Show if history exists for potential relevance
             <section className="mb-8">
               <h2 className="text-2xl font-bold mb-4 text-slate-800">{activeCollection.name} Progress Stats</h2>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="bg-white p-5 rounded-2xl shadow-md hover:shadow-lg transition-shadow duration-200">
                   <div className="flex items-center mb-3"> <Flame size={24} className="text-red-500" /> <h3 className="ml-3 text-xl font-medium text-slate-700">Current Streak</h3> </div>
                   <p className="text-3xl font-bold text-center py-3 text-slate-800">{streak} {streak === 1 ? 'day' : 'days'}</p>
                 </div>
                 <div className="bg-white p-5 rounded-2xl shadow-md hover:shadow-lg transition-shadow duration-200">
                   <div className="flex items-center mb-3"> <Calendar size={24} className="text-purple-500" /> <h3 className="ml-3 text-xl font-medium text-slate-700">Total Days Logged</h3> </div>
                   <p className="text-3xl font-bold text-center py-3 text-slate-800">{totalDaysLogged} {totalDaysLogged === 1 ? 'day' : 'days'}</p>
                 </div>
               </div>
                 <p className="text-xs text-center text-slate-500 mt-2">Stats based on days where at least one habit in this collection was logged.</p>
             </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white py-4 px-4 border-t border-slate-200">
        {/* Footer remains the same */}
        <div className="container mx-auto max-w-3xl flex flex-col sm:flex-row justify-between items-center"> <div className="text-sm text-slate-500 mb-2 sm:mb-0">© {new Date().getFullYear()} HabitFlow.</div> <div className="flex space-x-6 text-sm"> <a href="#" className="text-slate-600 hover:text-teal-600 transition-colors duration-200">Privacy</a> <a href="#" className="text-slate-600 hover:text-teal-600 transition-colors duration-200">Help</a> </div> </div>
      </footer>

      {/* Modals */}
      {showReminderModal && ( <ReminderModal onClose={toggleReminderModal} onLogNow={handleLogNow} /> )}
      {/* Pass active collection context if needed, though not strictly necessary for adding */}
      {showAddHabitModal && ( <AddHabitModal onClose={() => setShowAddHabitModal(false)} onSave={handleAddHabit} /> )}
      {showAddCollectionModal && ( <AddCollectionModal onClose={() => setShowAddCollectionModal(false)} onSave={handleAddCollection}/> )}

      {/* Global Styles */}
      <style jsx global>{`
        /* Slider and Modal styles remain the same */
        input[type=range].h-2 { height: 8px; } input[type=range].bg-slate-200 { background-color: #e2e8f0; } input[type=range].rounded-full { border-radius: 9999px; } input[type=range].appearance-none { -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; width: 100%; } input[type=range]:focus { outline: none; } input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px; background: white; border-radius: 50%; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: all 0.2s ease; margin-top: -6px; border: 2px solid; } input[type=range]::-moz-range-thumb { width: 20px; height: 20px; background: white; border-radius: 50%; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: all 0.2s ease; border: 2px solid; } input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.1); box-shadow: 0 3px 6px rgba(0,0,0,0.15); } input[type=range]::-moz-range-thumb:hover { transform: scale(1.1); box-shadow: 0 3px 6px rgba(0,0,0,0.15); }
        .slider-teal::-webkit-slider-thumb { border-color: #0d9488; } .slider-teal::-moz-range-thumb { border-color: #0d9488; } .slider-teal { background: linear-gradient(to right, #0d9488 0%, #0d9488 var(--value-percent, 0%), #e2e8f0 var(--value-percent, 0%), #e2e8f0 100%); border-radius: 9999px; }
        .slider-blue::-webkit-slider-thumb { border-color: #3b82f6; } .slider-blue::-moz-range-thumb { border-color: #3b82f6; } .slider-blue { background: linear-gradient(to right, #3b82f6 0%, #3b82f6 var(--value-percent, 0%), #e2e8f0 var(--value-percent, 0%), #e2e8f0 100%); border-radius: 9999px; }
        .slider-orange::-webkit-slider-thumb { border-color: #f97316; } .slider-orange::-moz-range-thumb { border-color: #f97316; } .slider-orange { background: linear-gradient(to right, #f97316 0%, #f97316 var(--value-percent, 0%), #e2e8f0 var(--value-percent, 0%), #e2e8f0 100%); border-radius: 9999px; }
        .slider-red::-webkit-slider-thumb { border-color: #ef4444; } .slider-red::-moz-range-thumb { border-color: #ef4444; } .slider-red { background: linear-gradient(to right, #ef4444 0%, #ef4444 var(--value-percent, 0%), #e2e8f0 var(--value-percent, 0%), #e2e8f0 100%); border-radius: 9999px; }
        .slider-purple::-webkit-slider-thumb { border-color: #a855f7; } .slider-purple::-moz-range-thumb { border-color: #a855f7; } .slider-purple { background: linear-gradient(to right, #a855f7 0%, #a855f7 var(--value-percent, 0%), #e2e8f0 var(--value-percent, 0%), #e2e8f0 100%); border-radius: 9999px; }
        .slider-green::-webkit-slider-thumb { border-color: #22c55e; } .slider-green::-moz-range-thumb { border-color: #22c55e; } .slider-green { background: linear-gradient(to right, #22c55e 0%, #22c55e var(--value-percent, 0%), #e2e8f0 var(--value-percent, 0%), #e2e8f0 100%); border-radius: 9999px; }
        .slider-pink::-webkit-slider-thumb { border-color: #ec4899; } .slider-pink::-moz-range-thumb { border-color: #ec4899; } .slider-pink { background: linear-gradient(to right, #ec4899 0%, #ec4899 var(--value-percent, 0%), #e2e8f0 var(--value-percent, 0%), #e2e8f0 100%); border-radius: 9999px; }
        .slider-indigo::-webkit-slider-thumb { border-color: #6366f1; } .slider-indigo::-moz-range-thumb { border-color: #6366f1; } .slider-indigo { background: linear-gradient(to right, #6366f1 0%, #6366f1 var(--value-percent, 0%), #e2e8f0 var(--value-percent, 0%), #e2e8f0 100%); border-radius: 9999px; }
        .modal-backdrop { animation: fadeIn 0.2s ease-out; } .modal-content { animation: slideIn 0.2s ease-out; } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideIn { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// --- Add Habit Modal Component (No change needed) ---
interface AddHabitModalProps {
  onClose: () => void;
  onSave: (newHabitData: Omit<HabitDefinition, 'id' | 'iconName' | 'color'>) => void;
}
function AddHabitModal({ onClose, onSave }: AddHabitModalProps) {
  const [name, setName] = useState(''); const [unit, setUnit] = useState('');
  const [sliderMax, setSliderMax] = useState(10); const [sliderStep, setSliderStep] = useState(1);
  const [error, setError] = useState('');
  const handleSave = () => {
    if (!name.trim()) { setError('Habit name is required.'); return; } if (!unit.trim()) { setError('Unit is required.'); return; }
    if (sliderMax <= 0) { setError('Max value must be positive.'); return; } if (sliderStep <= 0 || sliderStep > sliderMax) { setError('Step must be positive and <= Max value.'); return; }
    setError(''); onSave({ name: name.trim(), unit: unit.trim(), sliderMax, sliderStep });
  };
  return ( <div className="fixed inset-0 bg-slate-900 bg-opacity-60 flex items-center justify-center z-50 p-4 modal-backdrop"> <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 modal-content"> <div className="flex justify-between items-center mb-5"> <h3 className="text-xl font-bold text-slate-800">Add New Habit</h3> <button onClick={onClose} className="text-slate-500 hover:text-slate-700 transition-colors"> <X size={22} /> </button> </div> <div className="space-y-4"> <div> <label htmlFor="habitName" className="block text-sm font-medium text-slate-600 mb-1">Habit Name</label> <input type="text" id="habitName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Reading, Meditation" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"/> </div> <div> <label htmlFor="habitUnit" className="block text-sm font-medium text-slate-600 mb-1">Unit</label> <input type="text" id="habitUnit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g., pages, minutes, times" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"/> </div> <div className="grid grid-cols-2 gap-4"> <div> <label htmlFor="sliderMax" className="block text-sm font-medium text-slate-600 mb-1">Max Value</label> <input type="number" id="sliderMax" value={sliderMax} onChange={(e) => setSliderMax(Math.max(1, parseInt(e.target.value) || 1))} min="1" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"/> </div> <div> <label htmlFor="sliderStep" className="block text-sm font-medium text-slate-600 mb-1">Step</label> <input type="number" id="sliderStep" value={sliderStep} onChange={(e) => setSliderStep(Math.max(0.1, parseFloat(e.target.value) || 0.1))} min="0.1" step="0.1" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"/> </div> </div> {error && <p className="text-sm text-red-600">{error}</p>} </div> <div className="mt-6 flex justify-end space-x-3"> <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"> Cancel </button> <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 transition-colors shadow-sm"> Save Habit </button> </div> </div> </div> );
}

// --- Reminder Modal (Extracted for clarity) ---
interface ReminderModalProps { onClose: () => void; onLogNow: () => void; }
function ReminderModal({ onClose, onLogNow }: ReminderModalProps) {
  return ( <div className="fixed inset-0 bg-slate-900 bg-opacity-50 flex items-center justify-center z-50 p-4 modal-backdrop"> <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 modal-content"> <div className="flex justify-end"> <button onClick={onClose} className="text-slate-500 hover:text-slate-700 transition-colors duration-200"> <X size={20} /> </button> </div> <div className="text-center mb-6"> <h3 className="text-xl font-bold mb-3 text-slate-800">{"Don't"} forget to log your habits!</h3> <p className="text-slate-600 leading-relaxed">Tracking daily helps build consistency.</p> </div> <button className="w-full py-3 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors duration-200 shadow-md" onClick={onLogNow}> Log Now </button> </div> </div> );
}

// --- Add Collection Modal ---
interface AddCollectionModalProps { onClose: () => void; onSave: (name: string) => void; }
function AddCollectionModal({ onClose, onSave }: AddCollectionModalProps) {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const nameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        nameInputRef.current?.focus(); // Auto-focus input on open
    }, []);

    const handleSave = () => {
        if (!name.trim()) { setError('Collection name cannot be empty.'); return; }
        setError('');
        onSave(name.trim());
    };

    return (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-60 flex items-center justify-center z-50 p-4 modal-backdrop">
            <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 modal-content">
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-xl font-bold text-slate-800">Add New Collection</h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-700 transition-colors"> <X size={22} /> </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="collectionName" className="block text-sm font-medium text-slate-600 mb-1">Collection Name</label>
                        <input
                            ref={nameInputRef}
                            type="text"
                            id="collectionName"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Health, Work, Morning Routine"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                     {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"> Cancel </button>
                    <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm"> Save Collection </button>
                </div>
            </div>
        </div>
    );
}