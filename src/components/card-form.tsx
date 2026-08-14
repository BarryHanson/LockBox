"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { encryptObject, retrieveEncryptionKey, decryptObject } from '@/lib/clientCrypto'

interface CardFormProps {
  initialData?: {
    id?: string
    name: string
    cardNumber: string
    expiryMonth: number
    expiryYear: number
    cvv: string
    billingAddress?: string
    tags: string[]
    encryptionData?: Record<string, any>
  }
  onSubmit: (data: any) => void
  onCancel: () => void
}

export function CardForm({ initialData, onSubmit, onCancel }: CardFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    cardNumber: initialData?.cardNumber || '',
    expiryMonth: initialData?.expiryMonth || 1,
    expiryYear: initialData?.expiryYear || new Date().getFullYear(),
    cvv: initialData?.cvv || '',
    billingAddress: initialData?.billingAddress || '',
    tags: initialData?.tags || [],
  })
  const [tagInput, setTagInput] = useState('')
  
  // Decrypt data when editing an existing card
  useEffect(() => {
    const decryptExistingData = async () => {
      if (initialData?.id && initialData?.encryptionData) {
        try {
          // Get the encryption key from session storage
          const encryptionKey = await retrieveEncryptionKey()
          
          if (!encryptionKey) {
            console.error('Encryption key not found. Please log in again.')
            return
          }
          
          // Fields to decrypt
          const fieldsToDecrypt = ['cardNumber', 'cvv', 'billingAddress'] as const
          
          // Decrypt the fields
          const decryptedData = await decryptObject(
            initialData,
            encryptionKey,
            fieldsToDecrypt as any, // Type assertion to resolve compatibility issues
            initialData.encryptionData
          )
          
          // Update form with decrypted values
          setFormData({
            name: initialData.name,
            cardNumber: decryptedData.cardNumber || '',
            expiryMonth: initialData.expiryMonth,
            expiryYear: initialData.expiryYear,
            cvv: decryptedData.cvv || '',
            billingAddress: decryptedData.billingAddress || '',
            tags: initialData.tags || [],
          })
        } catch (error) {
          console.error('Decryption error:', error)
        }
      }
    }
    
    decryptExistingData()
  }, [initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      // Get the encryption key from session storage
      const encryptionKey = await retrieveEncryptionKey()
      
      if (!encryptionKey) {
        console.error('Encryption key not found. Please log in again.')
        return
      }
      
      // Fields to encrypt - specify as string literals to satisfy TypeScript
      const fieldsToEncrypt = ['cardNumber', 'cvv', 'billingAddress'] as const
      
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
      console.error('Encryption error:', error)
      alert('Failed to encrypt card data. Please try again.')
    }
  }

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }))
      setTagInput('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Card Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
          className="w-full p-2 border rounded-md"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Card Number</label>
        <input
          type="text"
          value={formData.cardNumber}
          onChange={e => {
            const value = e.target.value.replace(/\D/g, '')
            if (value.length <= 16) {
              setFormData(prev => ({ ...prev, cardNumber: value }))
            }
          }}
          className="w-full p-2 border rounded-md font-mono"
          required
          maxLength={16}
          pattern="[0-9]{16}"
          placeholder="1234567890123456"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Expiry Date</label>
          <div className="flex gap-2">
            <select
              value={formData.expiryMonth}
              onChange={e => setFormData(prev => ({ ...prev, expiryMonth: parseInt(e.target.value) }))}
              className="p-2 border rounded-md"
              required
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                <option key={month} value={month}>
                  {month.toString().padStart(2, '0')}
                </option>
              ))}
            </select>
            <select
              value={formData.expiryYear}
              onChange={e => setFormData(prev => ({ ...prev, expiryYear: parseInt(e.target.value) }))}
              className="p-2 border rounded-md"
              required
            >
              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map(year => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">CVV</label>
          <input
            type="text"
            value={formData.cvv}
            onChange={e => {
              const value = e.target.value.replace(/\D/g, '')
              if (value.length <= 4) {
                setFormData(prev => ({ ...prev, cvv: value }))
              }
            }}
            className="w-full p-2 border rounded-md font-mono"
            required
            maxLength={4}
            pattern="[0-9]{3,4}"
            placeholder="123"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Billing Address</label>
        <textarea
          value={formData.billingAddress}
          onChange={e => setFormData(prev => ({ ...prev, billingAddress: e.target.value }))}
          className="w-full p-2 border rounded-md h-24 resize-none"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Tags</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            className="flex-1 p-2 border rounded-md"
            placeholder="Add a tag..."
            onKeyPress={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addTag}>
            Add
          </Button>
        </div>
        {formData.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {formData.tags.map(tag => (
              <span
                key={tag}
                className="px-2 py-1 text-sm rounded-full bg-primary/10 text-primary flex items-center gap-1"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-primary hover:text-primary/80"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {initialData ? 'Update' : 'Create'} Card
        </Button>
      </div>
    </form>
  )
}
