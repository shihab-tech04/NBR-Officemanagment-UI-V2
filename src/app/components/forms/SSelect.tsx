import {AppSelectField} from "./AppSelectField";

interface SSelectProps {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label?: string;
}

/** Use the same compact dropdown/search interaction in Office legacy forms. */
export function SSelect({id,value,onChange,options,label}:SSelectProps){
  return <AppSelectField id={id} label={label??''} value={value}
    onChange={onChange} options={options} searchableAfter={4}/>;
}
