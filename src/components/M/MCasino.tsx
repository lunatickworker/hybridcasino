interface Sample1CasinoProps {
  user: any;
}

export function Sample1Casino({ user }: Sample1CasinoProps) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <img
        src="https://wvipjxivfxuwaxvlveyv.supabase.co/storage/v1/object/public/M/main.jpg"
        alt="M Main"
        className="w-full h-full object-cover"
      />
    </div>
  );
}