import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Field {
  api_name: string;
  field_label: string;
  data_type: string;
}

interface SmartTextSplitterProps {
  fields: Field[]; 
  onSplitValues: (updatedFields: Record<string, string>) => void; 
  value?: string;
  onChange?: (val: string) => void;
}

export function SmartTextSplitter({ fields, onSplitValues, value, onChange }: SmartTextSplitterProps) {
  const [internalText, setInternalText] = useState(value || "");

  // 🚨 FIXED: This forces the box to update instantly when "Apply All" sends new text
  useEffect(() => {
    if (value !== undefined) {
      setInternalText(value);
    }
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setInternalText(newText);
    if (onChange) {
        onChange(newText); 
    }
  };

  const multilineFields = fields.filter(field => field.data_type === 'multiline');

  const handleSplitText = () => {
    if (multilineFields.length === 0) {
      alert("No multiline fields found in this form!");
      return;
    }

    if (!internalText) return;

    // 🚨 FIXED: Alphabetical sort so the letter NEVER scrambles when you click the button!
    const sortedFields = [...multilineFields].sort((a, b) => 
        a.api_name.localeCompare(b.api_name, undefined, {numeric: true, sensitivity: 'base'})
    );

    const numFields = sortedFields.length;
    const totalLength = internalText.length;
    const chunkSize = Math.ceil(totalLength / numFields); 

    if (chunkSize > 800) {
        alert(`Error: Your text is too large! It requires ${chunkSize} characters per field, but the maximum allowed is 800. Please create more multiline fields in Zoho or shorten the text.`);
        return;
    }

    const newFieldValues: Record<string, string> = {};

    for (let i = 0; i < numFields; i++) {
      const fieldApiName = sortedFields[i].api_name;
      const startIndex = i * chunkSize;
      const endIndex = startIndex + chunkSize;
      newFieldValues[fieldApiName] = internalText.substring(startIndex, endIndex);
    }

    onSplitValues(newFieldValues);
    alert(`Success! Split ${totalLength} characters perfectly across ${numFields} fields.`);
  };

  return (
    <div className="p-4 mb-6 border rounded-lg bg-slate-50 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-800">Smart Text Splitter</h3>
        <p className="text-xs text-slate-500">
          Paste your large text/code here. It will automatically split into equal parts across the <strong>{multilineFields.length}</strong> available multiline fields. <span className="text-red-500">(Max 800 chars per field)</span>
        </p>
      </div>

      <Textarea 
        placeholder="Paste your giant block of text or code here..."
        value={internalText}
        onChange={handleTextChange}
        className="min-h-[120px] bg-white"
      />

      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-500">
          Total Characters: {internalText.length} 
          {internalText.length > 0 && multilineFields.length > 0 && (
            <span className={`ml-2 ${Math.ceil(internalText.length / multilineFields.length) > 800 ? 'text-red-600 font-bold' : 'text-blue-600'}`}>
              (~{Math.ceil(internalText.length / multilineFields.length)} characters per field)
            </span>
          )}
        </div>
        <Button 
          type="button" 
          variant="default" 
          onClick={handleSplitText}
          disabled={multilineFields.length === 0 || internalText.length === 0}
        >
          Split & Fill Fields
        </Button>
      </div>
    </div>
  );
}