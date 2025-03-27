import os

def convert_to_utf8_crlf(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            file_path = os.path.join(root, file)
            try:
                # Read as binary first to determine current encoding
                with open(file_path, 'rb') as f:
                    content = f.read()
                
                # Remove BOM if present
                if content.startswith(b'\xef\xbb\xbf'):
                    content = content[3:]
                
                # Decode using UTF-8
                text = content.decode('utf-8')
                
                # Normalize newlines and convert to CRLF
                text = text.replace('\r\n', '\n').replace('\r', '\n').replace('\n', '\r\n')
                
                # Write back as UTF-8 without BOM
                with open(file_path, 'wb') as f:
                    f.write(text.encode('utf-8'))
            except Exception as e:
                print(f"Error processing {file_path}: {e}")

# Replace with your folder path
convert_to_utf8_crlf(r"")