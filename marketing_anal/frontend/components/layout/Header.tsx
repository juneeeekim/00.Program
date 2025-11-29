/**
 * ==================================================
 * Header Component
 * ==================================================
 * Purpose: Top navigation bar with date range picker
 * Features:
 * - Date range selection
 * - Callback to parent for date changes
 * - Responsive design
 * ==================================================
 */

'use client';

import { useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// ==================================================
// SECTION 1: TypeScript Interfaces
// ==================================================

interface HeaderProps {
  onDateRangeChange?: (startDate: Date | null, endDate: Date | null) => void;
}

// ==================================================
// SECTION 2: Header Component
// ==================================================

export default function Header({ onDateRangeChange }: HeaderProps) {
  // Date state management
  const [startDate, setStartDate] = useState<Date | null>(new Date(2025, 10, 1)); // Nov 1, 2025
  const [endDate, setEndDate] = useState<Date | null>(new Date(2025, 10, 30)); // Nov 30, 2025

  // Handle date change
  const handleDateChange = (dates: [Date | null, Date | null]) => {
    const [start, end] = dates;
    setStartDate(start);
    setEndDate(end);
    
    // Notify parent component when both dates are selected
    if (start && end && onDateRangeChange) {
      onDateRangeChange(start, end);
    }
  };

  return (
    <header className="h-16 bg-slate-900/50 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 sticky top-0 z-10">
      <h2 className="text-lg font-semibold text-slate-100">Marketing Dashboard</h2>
      
      <div className="flex items-center space-x-4">
        {/* Date Range Picker */}
        <div className="date-picker-wrapper">
          <DatePicker
            selected={startDate}
            onChange={handleDateChange}
            startDate={startDate}
            endDate={endDate}
            selectsRange
            dateFormat="yyyy-MM-dd"
            className="text-sm text-slate-300 bg-slate-800 px-3 py-1.5 rounded border border-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
            placeholderText="Select date range"
          />
        </div>
      </div>

      {/* Custom styles for react-datepicker */}
      <style jsx global>{`
        .react-datepicker {
          background-color: #1e293b !important;
          border: 1px solid #334155 !important;
          font-family: inherit;
        }
        
        .react-datepicker__header {
          background-color: #0f172a !important;
          border-bottom: 1px solid #334155 !important;
        }
        
        .react-datepicker__current-month,
        .react-datepicker__day-name {
          color: #f8fafc !important;
        }
        
        .react-datepicker__day {
          color: #cbd5e1 !important;
        }
        
        .react-datepicker__day:hover {
          background-color: #334155 !important;
        }
        
        .react-datepicker__day--selected,
        .react-datepicker__day--in-range {
          background-color: #3b82f6 !important;
          color: white !important;
        }
        
        .react-datepicker__day--keyboard-selected {
          background-color: #1e40af !important;
        }
        
        .react-datepicker__day--disabled {
          color: #475569 !important;
        }
      `}</style>
    </header>
  );
}
