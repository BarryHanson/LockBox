"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-react'
import { encryptObject, retrieveEncryptionKey, decryptObject } from '@/lib/clientCrypto'
import { PasswordGenerator } from './PasswordGenerator'

interface PasswordFormProps {
  initialData?: {
    id?: string
    title: string
    username: string
    password: string
    url?: string
    notes?: string
    encryptionData?: Record<string, any>
  }
  onSubmit: (data: any) => void
  onCancel: () => void
}

export function PasswordForm({ initialData, onSubmit, onCancel }: PasswordFormProps) {
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    username: initialData?.username || '',
    password: initialData?.password || '',
    url: initialData?.url || '',
    notes: initialData?.notes || '',
  })
  
  const [showPasswordGenerator, setShowPasswordGenerator] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  // Decrypt data when editing an existing password
  useEffect(() => {
    const decryptExistingData = async () => {
      if (initialData?.id && initialData?.encryptionData) {
        try {
          // Get the encryption key from session storage
          const encryptionKey = await retrieveEncryptionKey()
          
          if (!encryptionKey) {
            return
          }
          // Fields to decrypt
          const fieldsToDecrypt = ['username', 'password', 'notes'] as const
          
          // Decrypt the fields
          const decryptedData = await decryptObject(
            initialData,
            encryptionKey,
            fieldsToDecrypt as any, // Type assertion to resolve compatibility issues
            initialData.encryptionData
          )
          
          // Update form with decrypted values
          setFormData({
            title: initialData.title,
            username: decryptedData.username || '',
            password: decryptedData.password || '',
            url: initialData.url || '',
            notes: decryptedData.notes || '',
          })
        } catch (error) {
        }
      }
    }
    
    decryptExistingData()
  }, [initialData])

  const handleGeneratePassword = () => {
    setShowPasswordGenerator(true)
  }
  
  const handleSelectPassword = (password: string) => {
    setFormData(prev => ({
      ...prev,
      password
    }))
    setShowPasswordGenerator(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      // Get the encryption key from session storage
      const encryptionKey = await retrieveEncryptionKey()
      
      if (!encryptionKey) {
        return
      }
      // Fields to encrypt - specify as string literals to satisfy TypeScript
      const fieldsToEncrypt = ['password', 'username', 'notes'] as const

      // Encrypt sensitive fields
      const { encryptedObj, encryptionData } = await encryptObject(
        formData,
        encryptionKey,
        fieldsToEncrypt as any // Type assertion to resolve compatibility issues
      )
      
      // Submit the encrypted data along with encryption metadata
      onSubmit({
        ...encryptedObj,
        id: initialData?.id,
        encryptionData
      })
    } catch (error) {
      alert('Failed to encrypt data. Please try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Title</label>
        <input
          type="text"
          value={formData.title}
          onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
          className="w-full p-2 border rounded-md"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Username/Email</label>
        <input
          type="text"
          value={formData.username}
          onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))}
          className="w-full p-2 border rounded-md"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Password</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
              className="w-full p-2 border rounded-md font-mono pr-10"
              required
            />
            <button 
              type="button"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleGeneratePassword}
          >
            Generate
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Website URL</label>
        <input
          type="url"
          value={formData.url}
          onChange={e => setFormData(prev => ({ ...prev, url: e.target.value }))}
          className="w-full p-2 border rounded-md"
          placeholder="https://"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Notes</label>
        <textarea
          value={formData.notes}
          onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          className="w-full p-2 border rounded-md h-24 resize-none"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {initialData ? 'Update' : 'Create'} Password
        </Button>
      </div>
      {showPasswordGenerator && (
        <PasswordGenerator 
          isOpen={showPasswordGenerator}
          onClose={() => setShowPasswordGenerator(false)}
          onSelectPassword={handleSelectPassword}
        />
      )}
    </form>
  )
}
