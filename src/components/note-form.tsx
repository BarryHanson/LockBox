"use client"

import { useState, useEffect, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'; // Assuming shadcn/ui
import { encryptObject, retrieveEncryptionKey, decryptObject } from '@/lib/clientCrypto';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { createLowlight, all } from 'lowlight'; // Import createLowlight and all languages

// Define Tag interface (ideally, this would be in a shared types file)
interface Tag {
  id: string;
  name: string;
}
import '@tiptap/extension-text-style'; // Ensures TextStyle is registered for FontSize to target

// Create a lowlight instance with all common languages registered
const lowlightInstance = createLowlight(all);

// Custom FontSize Extension
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    }
  }
}

export const FontSize = Extension.create<{
  types: string[];
}> ({
  name: 'fontSize',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize?.replace(/['"]+/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontSize) {
                return {};
              }
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize }).run();
      },
      unsetFontSize: () => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize: null }).run();
      },
    };
  },
});


import TextStyle from '@tiptap/extension-text-style';
import { SketchPicker, ColorResult } from 'react-color';
import {
  Bold, Italic, Strikethrough, List, ListOrdered, Code as CodeIcon, Heading1, Heading2, Heading3, Pilcrow,
  Palette, Eraser, AlignLeft, AlignCenter, AlignRight, AlignJustify, ChevronDown, // ChevronDown for dropdown trigger
  Type, PilcrowSquare // More specific icons for dropdowns if needed, Type for text type, PilcrowSquare for paragraph in dropdown
} from 'lucide-react';

interface NoteFormProps {
  initialData?: {
    id?: string;
    encryptedTitle: string;
    encryptedContent: string; // This will be encrypted HTML
    encryptionMetadata: Record<string, any>;
    tags?: Tag[]; // Add tags to initialData
    lastModified?: string; // Keep lastModified if it's part of initialData structure
    isPinned?: boolean; // Keep isPinned if it's part of initialData structure
  };
  allTags: Tag[]; // Pass all available tags to the form
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

// TipTap MenuBar Component
const FONT_SIZES = [
  { name: 'Default', value: 'default_size' }, // Special value for default
  { name: 'Small', value: '0.875rem' },
  { name: 'Normal', value: '1rem' },
  { name: 'Large', value: '1.25rem' },
  { name: 'Extra Large', value: '1.5rem' }
];

const FONT_FAMILIES = [
  { name: 'Default Font', value: 'default_family' }, // Special value for default
  { name: 'Inter', value: 'Inter, sans-serif' },
  { name: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { name: 'Georgia', value: 'Georgia, serif' },
  { name: 'Times New Roman', value: 'Times New Roman, Times, serif' },
  { name: 'Courier New', value: 'Courier New, Courier, monospace' },
  { name: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { name: 'Comic Sans MS', value: 'Comic Sans MS, cursive, sans-serif' }
];

// TipTap MenuBar Component
const MenuBar = ({ editor, isSubmitting }: { editor: Editor | null, isSubmitting: boolean }) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [currentColor, setCurrentColor] = useState('#000000'); // Default to black
  if (!editor) {
    return null;
  }

  // Define button groups for dropdowns
  const styleButtons = [
    { action: () => editor.chain().focus().toggleBold().run(), isActive: 'bold', title: 'Bold', icon: Bold, can: () => editor.can().chain().focus().toggleBold().run() },
    { action: () => editor.chain().focus().toggleItalic().run(), isActive: 'italic', title: 'Italic', icon: Italic, can: () => editor.can().chain().focus().toggleItalic().run() },
    { action: () => editor.chain().focus().toggleStrike().run(), isActive: 'strike', title: 'Strikethrough', icon: Strikethrough, can: () => editor.can().chain().focus().toggleStrike().run() },
  ];

  const typeButtons = [
    { action: () => editor.chain().focus().setParagraph().run(), isActive: 'paragraph', title: 'Paragraph', icon: PilcrowSquare, can: () => editor.can().chain().focus().setParagraph().run() },
    { action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), isActive: 'heading', params: { level: 1 }, title: 'Heading 1', icon: Heading1, can: () => editor.can().chain().focus().toggleHeading({ level: 1 }).run() },
    { action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), isActive: 'heading', params: { level: 2 }, title: 'Heading 2', icon: Heading2, can: () => editor.can().chain().focus().toggleHeading({ level: 2 }).run() },
    { action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), isActive: 'heading', params: { level: 3 }, title: 'Heading 3', icon: Heading3, can: () => editor.can().chain().focus().toggleHeading({ level: 3 }).run() },
  ];

  const listButtons = [
    { action: () => editor.chain().focus().toggleBulletList().run(), isActive: 'bulletList', title: 'Bullet List', icon: List, can: () => editor.can().chain().focus().toggleBulletList().run() },
    { action: () => editor.chain().focus().toggleOrderedList().run(), isActive: 'orderedList', title: 'Ordered List', icon: ListOrdered, can: () => editor.can().chain().focus().toggleOrderedList().run() },
  ];

  const remainingButtons = [
    { action: () => editor.chain().focus().toggleCodeBlock().run(), isActive: 'codeBlock', title: 'Code Block', icon: CodeIcon, can: () => editor.can().chain().focus().toggleCodeBlock().run() },
  ];

  const alignmentButtons = [
    { action: () => editor.chain().focus().setTextAlign('left').run(), isActive: 'textAlign', params: { textAlign: 'left' }, title: 'Align Left', icon: AlignLeft, can: () => editor.can().chain().focus().setTextAlign('left').run() },
    { action: () => editor.chain().focus().setTextAlign('center').run(), isActive: 'textAlign', params: { textAlign: 'center' }, title: 'Align Center', icon: AlignCenter, can: () => editor.can().chain().focus().setTextAlign('center').run() },
    { action: () => editor.chain().focus().setTextAlign('right').run(), isActive: 'textAlign', params: { textAlign: 'right' }, title: 'Align Right', icon: AlignRight, can: () => editor.can().chain().focus().setTextAlign('right').run() },
    { action: () => editor.chain().focus().setTextAlign('justify').run(), isActive: 'textAlign', params: { textAlign: 'justify' }, title: 'Align Justify', icon: AlignJustify, can: () => editor.can().chain().focus().setTextAlign('justify').run() },
  ];



  return (
    <div className="flex flex-wrap items-center gap-1 border-x border-t border-input rounded-t-md px-2 py-1 bg-background relative">
      {/* Font Family Dropdown */}
      <Select
        value={editor.getAttributes('textStyle').fontFamily || 'default_family'}
        onValueChange={(value) => {
          if (value === 'default_family') {
            editor.chain().focus().unsetFontFamily().run();
          } else {
            editor.chain().focus().setFontFamily(value).run();
          }
        }}
        disabled={isSubmitting}
      >
        <SelectTrigger className="w-[150px]" title="Font Family">
          <SelectValue placeholder="Font Family" />
        </SelectTrigger>
        <SelectContent>
          {FONT_FAMILIES.map(font => (
            <SelectItem key={font.value} value={font.value} style={{ fontFamily: font.value === 'default_family' ? 'inherit' : font.value }}>
              {font.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Font Size Dropdown */}
      {editor && (
        <Select
          disabled={isSubmitting}
          value={FONT_SIZES.find(size => size.value !== 'default_size' && editor.isActive('textStyle', { fontSize: size.value }))?.value || 'default_size'}
          onValueChange={(value) => {
            if (value === 'default_size') {
              editor.chain().focus().unsetFontSize().run();
            } else if (value) {
              editor.chain().focus().setFontSize(value).run();
            }
          }}
        >
          <SelectTrigger className="p-1.5 h-auto w-auto min-w-[100px] text-sm" title="Font Size">
            <SelectValue placeholder="Font Size" />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map(size => (
              <SelectItem key={size.name} value={size.value}>
                {size.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Style Dropdown */}
      {editor && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="p-2 h-auto" disabled={isSubmitting} title="Text Style">
              <Type className="w-4 h-4" /> <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {styleButtons.map(btn => (
              <DropdownMenuItem
                key={btn.title}
                onClick={btn.action}
                disabled={!btn.can()}
                className={editor.isActive(btn.isActive, (btn as any).params) ? 'is-active bg-muted' : ''}
              >
                <btn.icon className="w-4 h-4 mr-2" /> {btn.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Type/Heading Dropdown */}
      {editor && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="p-2 h-auto" disabled={isSubmitting} title="Text Type">
              <PilcrowSquare className="w-4 h-4" /> <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {typeButtons.map(btn => (
              <DropdownMenuItem
                key={btn.title}
                onClick={btn.action}
                disabled={!btn.can()}
                className={editor.isActive(btn.isActive, (btn as any).params) ? 'is-active bg-muted' : ''}
              >
                <btn.icon className="w-4 h-4 mr-2" /> {btn.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      
      {/* List Buttons (could be a dropdown too) */}
      {editor && listButtons.map(btn => (
        <Button
          key={btn.title}
          type="button"
          variant="ghost"
          onClick={btn.action}
          className={`p-2 h-auto ${editor.isActive(btn.isActive, (btn as any).params) ? 'is-active bg-muted' : ''}`}
          title={btn.title}
          disabled={isSubmitting || !btn.can()}
        >
          <btn.icon className="w-4 h-4" />
        </Button>
      ))}

      {/* Remaining Individual Buttons */}
      {editor && remainingButtons.map(btn => (
        <Button
          key={btn.title}
          type="button"
          variant="ghost"
          onClick={btn.action}
          className={`p-2 h-auto ${editor.isActive(btn.isActive, (btn as any).params) ? 'is-active bg-muted' : ''}`}
          title={btn.title}
          disabled={isSubmitting || !btn.can()}
        >
          <btn.icon className="w-4 h-4" />
        </Button>
      ))}

      {/* Alignment Buttons (could be a dropdown too) */}
      {editor && alignmentButtons.map(btn => (
        <Button
          key={btn.title}
          type="button"
          variant="ghost"
          onClick={btn.action}
          className={`p-2 h-auto ${editor.isActive(btn.isActive, (btn as any).params) ? 'is-active bg-muted' : ''}`}
          title={btn.title}
          disabled={isSubmitting || !btn.can()}
        >
          <btn.icon className="w-4 h-4" />
        </Button>
      ))}


      {/* Color Picker Toggle & Reset Button (kept separate for now) */}
      {editor && (
        <Button variant="ghost" onClick={() => setShowColorPicker(!showColorPicker)} className="p-2 h-auto" disabled={isSubmitting} title="Text Color">
          <Palette className="w-4 h-4" />
        </Button>
      )}
      {editor && (
        <Button variant="ghost" onClick={() => editor.chain().focus().unsetColor().run()} className="p-2 h-auto" disabled={isSubmitting || !editor.can().chain().focus().unsetColor().run()} title="Reset Color">
          <Eraser className="w-4 h-4" />
        </Button>
      )}

      {showColorPicker && editor && (
        <div style={{ position: 'absolute', zIndex: 2, top: '100%', left: 0 }} className="mt-1">
          <SketchPicker
            color={currentColor}
            onChangeComplete={(color: ColorResult) => {
              setCurrentColor(color.hex);
              editor.chain().focus().setColor(color.hex).run();
            }}
            styles={{ default: { picker: { boxShadow: '0 0 10px rgba(0,0,0,0.1)', borderRadius: '4px' } } }}
          />
        </div>
      )}
    </div>
  );
};


export function NoteForm({ initialData, allTags, onSubmit, onCancel, isSubmitting }: NoteFormProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        codeBlock: false, // Disable StarterKit's default codeBlock to use CodeBlockLowlight
      }),
      Color.configure({ types: ['textStyle', 'listItem'] }),
      TextStyle, // Keep TextStyle for general style attributes
      FontFamily,
      FontSize, // Add our custom FontSize extension
      CodeBlockLowlight.configure({ lowlight: lowlightInstance }), // Pass the created and configured instance
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: '', 
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert prose-sm sm:prose-base focus:outline-none min-h-[300px] sm:min-h-[400px] md:min-h-[500px] border-x border-b border-input bg-transparent rounded-b-md p-2 w-full',
      },
    },
  });

  useEffect(() => {
    const processInitialData = async () => {
      if (initialData?.id && initialData.encryptionMetadata && initialData.encryptedTitle && initialData.encryptedContent) {
        try {
          const retrievedKey = await retrieveEncryptionKey();
          if (!retrievedKey) {
            setError('Encryption key not available. Please unlock the vault again.');
            return;
          }
          const dataToDecrypt = {
            title: initialData.encryptedTitle,
            content: initialData.encryptedContent,
          };
          const decryptedData = await decryptObject(
            dataToDecrypt,
            retrievedKey,
            ['title', 'content'] as const,
            initialData.encryptionMetadata
          );
          setTitle(decryptedData.title || '');
          if (editor && !editor.isDestroyed) {
            editor.commands.setContent(decryptedData.content || '<p></p>', false);
          }
          if (initialData.tags) {
            setSelectedTagIds(initialData.tags.map(tag => tag.id));
          }
        } catch (err) {
          console.error('[NoteForm] Decryption error:', err);
          setError('Failed to decrypt note data. The data might be corrupted or the key is incorrect.');
        }
      } else {
        setTitle('');
        if (editor && !editor.isDestroyed) {
         editor.commands.setContent('<p></p>', false);
        }
        setSelectedTagIds([]); // Reset tags for new note form
      }
    };
    
    if (editor && !editor.isDestroyed) {
        processInitialData();
    } else if (editor?.isDestroyed) {
        console.warn("[NoteForm] Attempted to process initial data on a destroyed editor instance.");
    }

  }, [initialData, editor]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editor || editor.isDestroyed) {
      setError("Editor not initialized or has been destroyed.");
      return;
    }
    if (!title.trim()) {
        setError("Title is required.");
        return;
    }
    if (editor.getText().trim().length === 0) {
        setError("Content cannot be empty.");
        return;
    }

    try {
      const retrievedKeyOnSubmit = await retrieveEncryptionKey();
      if (!retrievedKeyOnSubmit) {
        setError('Encryption key not available. Please unlock the vault again.');
        return;
      }

      const htmlContent = editor.getHTML();

      const dataToEncrypt = {
        title: title,
        content: htmlContent,
        lastModified: new Date().toISOString()
        // tagIds and isPinned are handled in the final onSubmit object, not encrypted
      };

      const { encryptedObj, encryptionData } = await encryptObject(
        dataToEncrypt,
        retrievedKeyOnSubmit,
        ['title', 'content'] as const
      );

      onSubmit({
        id: initialData?.id,
        encryptedTitle: encryptedObj.title,
        encryptedContent: encryptedObj.content,
        lastModified: dataToEncrypt.lastModified,
        encryptionMetadata: encryptionData,
        tagIds: selectedTagIds, // Pass the array of selected tag IDs
        isPinned: initialData?.isPinned // Preserve pinned status if editing, or pass undefined for new notes
      });
    } catch (err) {
      console.error('[NoteForm] Encryption error during submission:', err);
      setError(`Encryption failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  
  useEffect(() => {
    // Effect to destroy the editor instance when the component unmounts
    return () => {
      if (editor && !editor.isDestroyed) {
        editor.destroy();
      }
    };
  }, [editor]); // Dependency array includes editor to re-run if editor instance changes

  return (
    <form onSubmit={handleSubmit} className="space-y-3 flex flex-col">
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="space-y-1">
        <Label htmlFor="note-title" className="text-sm font-medium">Title</Label>
        <Input
          id="note-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full"
          disabled={isSubmitting}
          placeholder="Note Title"
        />
      </div>

      <div className="space-y-1 flex flex-col min-h-0">
        <Label htmlFor="note-content" className="text-sm font-medium">Content</Label>
        <MenuBar editor={editor} isSubmitting={isSubmitting} />
        <EditorContent editor={editor} className="flex-grow min-h-[200px] max-h-[300px] overflow-y-auto border rounded-md" />
      </div>

      <div className="mt-3 space-y-3">
        {/* Tag Selection UI */}
        <div>
          <Label htmlFor="tags">Tags</Label>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-2 border rounded-md max-h-40 overflow-y-auto">
            {allTags.map(tag => (
              <div key={tag.id} className="flex items-center">
                <input
                  type="checkbox"
                  id={`tag-${tag.id}`}
                  value={tag.id}
                  checked={selectedTagIds.includes(tag.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedTagIds(prev => [...prev, tag.id]);
                    } else {
                      setSelectedTagIds(prev => prev.filter(id => id !== tag.id));
                    }
                  }}
                  className="mr-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  disabled={isSubmitting}
                />
                <Label htmlFor={`tag-${tag.id}`} className="text-sm font-medium text-gray-700 select-none">
                  {tag.name}
                </Label>
              </div>
            ))}
            {allTags.length === 0 && <p className="text-sm text-gray-500 col-span-full">No tags available. Create tags in the main view.</p>}
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting || !editor || !title.trim()}>
            {isSubmitting ? 'Saving...' : (initialData?.id ? 'Update Note' : 'Save Note')}
          </Button>
        </div>
      </div>
    </form>
  );
}