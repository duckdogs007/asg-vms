"use client"

import { useRef } from "react"

// Optional ID + Live photo capture for visitor check-in. Controlled: the parent
// holds the selected File[]s and runs saveVisitorPhotos() after the check-in
// saves (so photos attach to the created visitor + visitor_log).
export default function VisitorPhotoCapture({
  idFiles, liveFiles, setIdFiles, setLiveFiles,
}: {
  idFiles: File[]
  liveFiles: File[]
  setIdFiles: (f: File[]) => void
  setLiveFiles: (f: File[]) => void
}) {
  const idRef   = useRef<HTMLInputElement>(null)
  const liveRef = useRef<HTMLInputElement>(null)

  function addFiles(existing: File[], setter: (f: File[]) => void, list: FileList | null) {
    if (!list) return
    const incoming = Array.from(list).filter(f => f.type.startsWith("image/"))
    if (incoming.length) setter([...existing, ...incoming])
  }

  const box = (
    label: string, files: File[], setter: (f: File[]) => void,
    ref: React.RefObject<HTMLInputElement | null>,
  ) => (
    <div className="flex-1 min-w-[150px]">
      <div className="text-xs font-semibold text-gray-500 mb-1">{label} <span className="text-gray-400 font-normal">(optional)</span></div>
      <input
        ref={ref} type="file" accept="image/*" capture="environment" multiple className="hidden"
        onChange={e => { addFiles(files, setter, e.target.files); if (ref.current) ref.current.value = "" }}
      />
      <button type="button" onClick={() => ref.current?.click()}
        className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:border-blue-400 hover:text-blue-700 bg-white cursor-pointer">
        📷 Capture / Upload
      </button>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {files.map((f, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt="" className="w-14 h-14 object-cover rounded border border-gray-300" />
              <button type="button" onClick={() => setter(files.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 text-white text-[10px] rounded-full leading-none border-none cursor-pointer flex items-center justify-center">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Photos</div>
      <div className="flex gap-3 flex-wrap">
        {box("ID Photo", idFiles, setIdFiles, idRef)}
        {box("Live Photo(s)", liveFiles, setLiveFiles, liveRef)}
      </div>
    </div>
  )
}
