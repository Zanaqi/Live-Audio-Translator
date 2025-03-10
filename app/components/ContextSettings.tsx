import React from 'react';
import { ContextData, TourType } from '@/lib/utils/contextEngine';

interface ContextSettingsProps {
  context: Partial<ContextData>;
  onContextChange: (newContext: Partial<ContextData>) => void;
}

export default function ContextSettings({ context, onContextChange }: ContextSettingsProps) {
  const tourTypes: TourType[] = ['museum', 'city', 'nature', 'historical', 'art'];
  const audienceTypes = ['general', 'expert', 'children'];

  const handleChange = (
    field: keyof ContextData,
    value: string
  ) => {
    onContextChange({
      ...context,
      [field]: value
    });
  };

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900">Tour Context Settings</h3>
      
      <div className="space-y-3">
        {/* Tour Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tour Type
          </label>
          <select
            value={context.tourType || ''}
            onChange={(e) => handleChange('tourType', e.target.value as TourType)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Select Tour Type</option>
            {tourTypes.map((type) => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Location
          </label>
          <input
            type="text"
            value={context.location || ''}
            onChange={(e) => handleChange('location', e.target.value)}
            placeholder="Enter location"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Current Subject */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Current Subject
          </label>
          <input
            type="text"
            value={context.subject || ''}
            onChange={(e) => handleChange('subject', e.target.value)}
            placeholder="Enter current subject"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Current Theme */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Current Theme
          </label>
          <input
            type="text"
            value={context.currentTheme || ''}
            onChange={(e) => handleChange('currentTheme', e.target.value)}
            placeholder="Enter current theme"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Audience Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Audience Type
          </label>
          <select
            value={context.audienceType || 'general'}
            onChange={(e) => handleChange('audienceType', e.target.value as 'general' | 'expert' | 'children')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            {audienceTypes.map((type) => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Context Preview */}
      <div className="mt-4 p-3 bg-gray-50 rounded-md">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Current Context</h4>
        <pre className="text-xs text-gray-600 whitespace-pre-wrap">
          {JSON.stringify(context, null, 2)}
        </pre>
      </div>
    </div>
  );
}